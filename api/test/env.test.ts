import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

const validEnv = {
  NODE_ENV: "test",
  PORT: "3000",
  DATABASE_URL: "postgres://estacao:senha_exemplo@localhost:5432/estacao_meteorologica",
  API_KEY: "whs_test_ABC123",
  INGEST_API_KEY: "whs_test_ABC123",
};

describe("parseEnv", () => {
  it("retorna configuração tipada quando todas as variáveis obrigatórias estão presentes", () => {
    const env = parseEnv(validEnv);

    expect(env).toEqual({
      NODE_ENV: "test",
      PORT: 3000,
      DATABASE_URL: "postgres://estacao:senha_exemplo@localhost:5432/estacao_meteorologica",
      API_KEY: "whs_test_ABC123",
      INGEST_API_KEY: "whs_test_ABC123",
      MAX_BATCH: 5000,
    });
  });

  it("aplica defaults para NODE_ENV, PORT e MAX_BATCH quando ausentes", () => {
    const { DATABASE_URL, API_KEY, INGEST_API_KEY } = validEnv;
    const env = parseEnv({ DATABASE_URL, API_KEY, INGEST_API_KEY });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.MAX_BATCH).toBe(5000);
  });

  it("lança erro com mensagem clara quando falta variável obrigatória (DATABASE_URL)", () => {
    const withoutDatabaseUrl: Record<string, string> = { ...validEnv };
    delete withoutDatabaseUrl.DATABASE_URL;

    expect(() => parseEnv(withoutDatabaseUrl)).toThrowError(/DATABASE_URL/);
  });

  it("lança erro com mensagem clara quando falta variável obrigatória (API_KEY)", () => {
    const withoutApiKey: Record<string, string> = { ...validEnv };
    delete withoutApiKey.API_KEY;

    expect(() => parseEnv(withoutApiKey)).toThrowError(/API_KEY/);
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
});
