import { describe, expect, it } from "vitest";
import { parseEnv, parseRateLimitEnv } from "../src/config/env.js";

const validEnv = {
  NODE_ENV: "test",
  PORT: "3000",
  DATABASE_URL: "postgres://estacao:senha_exemplo@localhost:5432/estacao_meteorologica",
  INGEST_API_KEY: "whs_test_ABC123",
};

describe("parseEnv", () => {
  it("retorna configuração tipada quando todas as variáveis obrigatórias estão presentes", () => {
    const env = parseEnv(validEnv);

    expect(env).toEqual({
      NODE_ENV: "test",
      PORT: 3000,
      DATABASE_URL: "postgres://estacao:senha_exemplo@localhost:5432/estacao_meteorologica",
      INGEST_API_KEY: "whs_test_ABC123",
      MAX_BATCH: 5000,
      RATE_LIMIT_MAX: 100,
      RATE_LIMIT_WINDOW_MS: 60_000,
    });
  });

  it("aplica defaults para NODE_ENV, PORT, MAX_BATCH e rate limit quando ausentes", () => {
    const { DATABASE_URL, INGEST_API_KEY } = validEnv;
    const env = parseEnv({ DATABASE_URL, INGEST_API_KEY });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.MAX_BATCH).toBe(5000);
    expect(env.RATE_LIMIT_MAX).toBe(100);
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it("lança erro com mensagem clara quando falta variável obrigatória (DATABASE_URL)", () => {
    const withoutDatabaseUrl: Record<string, string> = { ...validEnv };
    delete withoutDatabaseUrl.DATABASE_URL;

    expect(() => parseEnv(withoutDatabaseUrl)).toThrowError(/DATABASE_URL/);
  });

  it("lança erro quando PORT não é numérico", () => {
    expect(() => parseEnv({ ...validEnv, PORT: "not-a-number" })).toThrow();
  });

  it("lança erro com mensagem clara quando falta variável obrigatória (INGEST_API_KEY)", () => {
    const withoutIngestApiKey: Record<string, string> = { ...validEnv };
    delete withoutIngestApiKey.INGEST_API_KEY;

    expect(() => parseEnv(withoutIngestApiKey)).toThrowError(/INGEST_API_KEY/);
  });

  it("aceita MAX_BATCH explícito e converte para number", () => {
    const env = parseEnv({ ...validEnv, MAX_BATCH: "2000" });

    expect(env.MAX_BATCH).toBe(2000);
  });

  it("lança erro quando MAX_BATCH não é numérico", () => {
    expect(() => parseEnv({ ...validEnv, MAX_BATCH: "not-a-number" })).toThrow();
  });

  it("aceita RATE_LIMIT_MAX/RATE_LIMIT_WINDOW_MS explícitos e converte para number", () => {
    const env = parseEnv({ ...validEnv, RATE_LIMIT_MAX: "10", RATE_LIMIT_WINDOW_MS: "1000" });

    expect(env.RATE_LIMIT_MAX).toBe(10);
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(1000);
  });

  it("lança erro quando RATE_LIMIT_MAX não é numérico", () => {
    expect(() => parseEnv({ ...validEnv, RATE_LIMIT_MAX: "not-a-number" })).toThrow();
  });
});

describe("parseRateLimitEnv (T7.2 — QA-07)", () => {
  it("aplica defaults (100 req / 60000ms) quando nenhuma variável está presente, sem exigir DATABASE_URL/INGEST_API_KEY", () => {
    const config = parseRateLimitEnv({});

    expect(config).toEqual({ RATE_LIMIT_MAX: 100, RATE_LIMIT_WINDOW_MS: 60_000 });
  });

  it("aceita overrides explícitos", () => {
    const config = parseRateLimitEnv({ RATE_LIMIT_MAX: "5", RATE_LIMIT_WINDOW_MS: "2000" });

    expect(config).toEqual({ RATE_LIMIT_MAX: 5, RATE_LIMIT_WINDOW_MS: 2000 });
  });

  it("lança erro com mensagem clara quando RATE_LIMIT_MAX é inválido", () => {
    expect(() => parseRateLimitEnv({ RATE_LIMIT_MAX: "not-a-number" })).toThrowError(
      /RATE_LIMIT_MAX/,
    );
  });
});
