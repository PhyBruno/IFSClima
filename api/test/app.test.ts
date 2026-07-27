import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("buildApp", () => {
  it("cria uma instância Fastify sem subir porta e sem lançar erro", async () => {
    const app = buildApp();

    expect(app).toBeDefined();
    expect(typeof app.inject).toBe("function");

    await app.ready();
    await app.close();
  });
});

describe("helmet (T7.2 — QA-08)", () => {
  it("qualquer resposta inclui os headers de segurança default do @fastify/helmet", async () => {
    const app = buildApp({ checkDb: async () => undefined });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["x-dns-prefetch-control"]).toBeDefined();

    await app.close();
  });
});

describe("trustProxy (F7 — rate limit não pode colapsar numa única chave atrás do Nginx)", () => {
  it("request.ip reflete X-Forwarded-For em vez do IP de quem conecta direto (o proxy)", async () => {
    const app = buildApp({ checkDb: async () => undefined });
    // Rota só-de-teste: expõe `request.ip` pra verificar o efeito de
    // `trustProxy` sem depender de internals do @fastify/rate-limit.
    app.get("/__test-ip", async (request) => ({ ip: request.ip }));
    await app.ready();

    const direct = await app.inject({ method: "GET", url: "/__test-ip" });
    expect(direct.json()).toEqual({ ip: "127.0.0.1" });

    const viaProxy = await app.inject({
      method: "GET",
      url: "/__test-ip",
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(viaProxy.json()).toEqual({ ip: "203.0.113.7" });

    await app.close();
  });
});
