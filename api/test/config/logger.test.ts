import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
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
  it("nunca loga X-API-Key em claro, mesmo quando o req logado inclui headers", () => {
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

    const logged = output();
    expect(logged).not.toContain(secret);
    expect(logged).toContain("[REDACTED]");
  });

  it("nunca loga Authorization em claro", () => {
    const { stream, output } = createCaptureStream();
    const logger = pino(createLoggerOptions(), stream);
    const secret = "Bearer super-secret-token";

    logger.info(
      { req: { method: "GET", url: "/health", headers: { authorization: secret } } },
      "incoming request",
    );

    const logged = output();
    expect(logged).not.toContain(secret);
    expect(logged).toContain("[REDACTED]");
  });

  it("não referencia request.body na config (nunca loga o corpo cru da requisição)", () => {
    const options = createLoggerOptions();

    expect(JSON.stringify(options)).not.toMatch(/body/i);
  });
});
