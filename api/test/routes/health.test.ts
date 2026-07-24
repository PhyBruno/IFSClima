import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeDb, createDb, getDb } from "../../src/db/client.js";
import { startTestPostgres, type TestPostgres } from "../db/helpers/testPostgres.js";

describe("GET /health — integração com Postgres real (T7.2 — QA-09)", () => {
  let testPg: TestPostgres;

  beforeAll(async () => {
    testPg = await startTestPostgres();
  }, 60000);

  afterAll(async () => {
    await testPg.stop();
  }, 30000);

  it("200 { status: 'ok' } quando o banco real responde a SELECT 1", async () => {
    const app = buildApp({
      checkDb: async () => {
        await testPg.db.execute(sql`select 1`);
      },
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("edge: 503 { status: 'unhealthy' } quando a conexão é um pool já fechado, sem lançar exceção", async () => {
    const { db, pool } = createDb(testPg.databaseUrl);
    await closeDb(pool); // simula "o db caiu" fechando o pool antes de usá-lo

    const app = buildApp({
      checkDb: async () => {
        await db.execute(sql`select 1`);
      },
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unhealthy" });

    await app.close();
  });

  it("edge: 503 { status: 'unhealthy' } quando a conexão aponta para um host inválido, sem lançar exceção", async () => {
    const { db, pool } = createDb("postgres://invalid:invalid@127.0.0.1:1/nope");

    const app = buildApp({
      checkDb: async () => {
        await db.execute(sql`select 1`);
      },
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unhealthy" });

    await app.close();
    await closeDb(pool);
  });
});

describe("GET /health — default checkDb (buildApp() sem options, via getDb() real)", () => {
  let testPg: TestPostgres;
  let app: FastifyInstance;
  let originalDatabaseUrl: string | undefined;
  let originalIngestApiKey: string | undefined;

  beforeAll(async () => {
    testPg = await startTestPostgres();

    // Sem NENHUMA option: healthRoute resolve a checagem via getDb() real,
    // preguiçosamente — só quando GET /health é de fato chamado (mesmo
    // espírito de lazyDrizzleReadingRepository/getIngestApiKey em app.ts).
    originalDatabaseUrl = process.env.DATABASE_URL;
    originalIngestApiKey = process.env.INGEST_API_KEY;
    process.env.DATABASE_URL = testPg.databaseUrl;
    process.env.INGEST_API_KEY = "whs_test_ABC123";

    app = buildApp();
  }, 60000);

  afterAll(async () => {
    await app.close();
    const { pool } = getDb();
    await closeDb(pool);
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.INGEST_API_KEY = originalIngestApiKey;
    await testPg.stop();
  }, 30000);

  it("200 { status: 'ok' } usando o client Drizzle padrão resolvido a partir do env", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
