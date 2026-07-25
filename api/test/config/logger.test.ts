import { Writable } from "node:stream";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLoggerOptions } from "../../src/config/logger.js";

/** Stream de teste que acumula tudo que é escrito, para inspecionar a saída bruta do pino. */
function createCaptureStream(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });

  return { stream, output: () => chunks.join("") };
}

describe("createLoggerOptions (T7.2 — QA-06)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("nunca loga X-API-Key em claro (fora da allowlist, nem chega a existir no objeto logado)", () => {
    const { stream, output } = createCaptureStream();
    const logger = pino(createLoggerOptions(), stream);
    const secret = "whs_super_secret_ABC123";

    logger.info(
      {
        req: {
          method: "POST",
          url: "/api/v1/ingest",
          headers: { "x-api-key": secret, "content-type": "application/json" },
        },
      },
      "incoming request",
    );

    const logged = JSON.parse(output());
    expect(JSON.stringify(logged)).not.toContain(secret);
    expect(logged.req.headers).not.toHaveProperty("x-api-key");
    // header permitido continua presente — a allowlist não é um apaga-tudo.
    expect(logged.req.headers["content-type"]).toBe("application/json");
  });

  it("nunca loga Authorization em claro (fora da allowlist, nem chega a existir no objeto logado)", () => {
    const { stream, output } = createCaptureStream();
    const logger = pino(createLoggerOptions(), stream);
    const secret = "Bearer super-secret-token";

    logger.info(
      { req: { method: "GET", url: "/health", headers: { authorization: secret } } },
      "incoming request",
    );

    const logged = JSON.parse(output());
    expect(JSON.stringify(logged)).not.toContain(secret);
    expect(logged.req.headers).not.toHaveProperty("authorization");
  });

  it("defesa em profundidade: redact ainda cobre req.headers['x-api-key']/authorization caso um header sensível escape da allowlist por engano", () => {
    const { stream, output } = createCaptureStream();
    // Usa o `redact` de createLoggerOptions() diretamente sobre um objeto que
    // já contém os headers sensíveis (sem passar pelo serializer.req, que é
    // a barreira estrutural principal) — simula o cenário em que algum
    // código logasse `req.headers` bruto por outro caminho.
    const { redact } = createLoggerOptions() as { redact: unknown };
    const logger = pino({ redact }, stream);
    const secret = "whs_super_secret_ABC123";

    logger.info({ req: { headers: { "x-api-key": secret } } }, "log direto sem serializer");

    const logged = output();
    expect(logged).not.toContain(secret);
    expect(logged).toContain("[REDACTED]");
  });

  it("não referencia request.body na config (nunca loga o corpo cru da requisição)", () => {
    const options = createLoggerOptions();

    expect(JSON.stringify(options)).not.toMatch(/body/i);
  });

  it("achado F7 (MÉDIA): serializer.req usa allowlist — header fora da allowlist (Cookie) nunca aparece em claro", () => {
    const { stream, output } = createCaptureStream();
    const logger = pino(createLoggerOptions(), stream);
    const cookieSecret = "session=segredo-de-sessao";

    logger.info(
      {
        req: {
          method: "GET",
          url: "/health",
          hostname: "localhost:3000",
          ip: "203.0.113.7",
          socket: { remotePort: 54321 },
          headers: { cookie: cookieSecret, "content-type": "application/json" },
        },
      },
      "incoming request",
    );

    const logged = JSON.parse(output());
    expect(logged.req.headers).not.toHaveProperty("cookie");
    expect(JSON.stringify(logged)).not.toContain(cookieSecret);
  });

  it("achado F7 (MÉDIA): header dentro da allowlist (Content-Type) aparece normalmente no log", () => {
    const { stream, output } = createCaptureStream();
    const logger = pino(createLoggerOptions(), stream);

    logger.info(
      {
        req: {
          method: "GET",
          url: "/health",
          hostname: "localhost:3000",
          ip: "203.0.113.7",
          socket: { remotePort: 54321 },
          headers: { "content-type": "application/json", cookie: "session=segredo" },
        },
      },
      "incoming request",
    );

    const logged = JSON.parse(output());
    expect(logged.req.headers["content-type"]).toBe("application/json");
  });

  it("achado F7 (MÉDIA): restaura o IP do cliente (remoteAddress/hostname/remotePort), perdido pelo serializer anterior", () => {
    const { stream, output } = createCaptureStream();
    const logger = pino(createLoggerOptions(), stream);

    logger.info(
      {
        req: {
          method: "GET",
          url: "/health",
          hostname: "localhost:3000",
          ip: "203.0.113.7",
          socket: { remotePort: 54321 },
          headers: { "content-type": "application/json" },
        },
      },
      "incoming request",
    );

    const logged = JSON.parse(output());
    expect(logged.req.remoteAddress).toBe("203.0.113.7");
    expect(logged.req.hostname).toBe("localhost:3000");
    expect(logged.req.remotePort).toBe(54321);
  });

  it("achado F7 (BAIXA): usa o LOG_LEVEL validado do env em vez de ler process.env cru", () => {
    vi.stubEnv("LOG_LEVEL", "debug");

    const options = createLoggerOptions();

    expect(options).toMatchObject({ level: "debug" });
  });

  it("achado F7 (BAIXA): LOG_LEVEL inválido lança erro claro (nunca deixa o pino explodir sem tratamento)", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");

    expect(() => createLoggerOptions()).toThrowError(/LOG_LEVEL/);
  });

  it("default é 'info' quando LOG_LEVEL não está definido", () => {
    const options = createLoggerOptions();

    expect(options).toMatchObject({ level: "info" });
  });
});
