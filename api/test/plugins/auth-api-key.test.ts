import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { constantTimeEquals, createApiKeyAuthPreHandler } from "../../src/plugins/auth-api-key.js";

const VALID_KEY = "whs_test_ABC123";

function buildTestApp(expectedKey: string = VALID_KEY) {
  const app = Fastify({ logger: false });

  app.get(
    "/protected",
    { preHandler: createApiKeyAuthPreHandler(() => expectedKey) },
    async () => ({ ok: true }),
  );

  return app;
}

describe("createApiKeyAuthPreHandler (T3.4 — ING-04, ING-05)", () => {
  it("responde 401 quando o header X-API-Key está ausente, sem chamar o handler", async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: "GET", url: "/protected" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("responde 401 quando o header X-API-Key está errado (mesmo tamanho da chave válida)", async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": "whs_test_ZZZZZZ" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("responde 401 quando o header X-API-Key está errado (tamanho diferente da chave válida)", async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": "curta" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("responde 401 quando o header X-API-Key vem vazio", async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": "" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("deixa a requisição prosseguir quando o header X-API-Key está correto", async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": VALID_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });

  it("o corpo da resposta 401 não vaza detalhes (nem a chave enviada, nem a esperada)", async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { "x-api-key": "chave-errada-nao-deve-aparecer" },
    });

    expect(response.statusCode).toBe(401);
    const body = response.body;
    expect(body).not.toMatch(/chave-errada-nao-deve-aparecer/);
    expect(body).not.toMatch(new RegExp(VALID_KEY));
  });

  it("getExpectedKey só é avaliada quando a rota protegida é chamada (lazy)", async () => {
    const provider = vi.fn(() => VALID_KEY);
    const app = Fastify({ logger: false });
    app.get("/protected", { preHandler: createApiKeyAuthPreHandler(provider) }, async () => ({
      ok: true,
    }));

    expect(provider).not.toHaveBeenCalled();

    await app.inject({ method: "GET", url: "/protected", headers: { "x-api-key": VALID_KEY } });

    expect(provider).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe("constantTimeEquals (T3.4 — ING-05)", () => {
  it("retorna true para strings idênticas", () => {
    expect(constantTimeEquals("abc123", "abc123")).toBe(true);
  });

  it("retorna false para strings diferentes de mesmo tamanho", () => {
    expect(constantTimeEquals("abc123", "abc124")).toBe(false);
  });

  it("retorna false (sem lançar) para strings de tamanhos diferentes", () => {
    expect(() => constantTimeEquals("curta", "uma-string-bem-mais-longa")).not.toThrow();
    expect(constantTimeEquals("curta", "uma-string-bem-mais-longa")).toBe(false);
  });

  it("retorna false (sem lançar) para string vazia comparada com chave não vazia", () => {
    expect(constantTimeEquals("", "whs_test_ABC123")).toBe(false);
  });
});
