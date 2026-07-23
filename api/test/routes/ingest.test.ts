import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeDb, getDb } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";
import { readings, stations } from "../../src/db/schema.js";
import { DrizzleReadingRepository } from "../../src/repositories/reading-repository.js";
import { startTestPostgres, type TestPostgres } from "../db/helpers/testPostgres.js";

const API_KEY = "whs_test_ABC123";

/**
 * Timestamp sempre no passado relativo ao relógio real do processo — os
 * testes de integração usam o clock real (`new Date()`) do
 * `IngestService`, então fixar strings de data absolutas arriscaria cair
 * no futuro (rejeição por ING-10) dependendo de quando os testes rodam.
 */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function reading(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: minutesAgo(60),
    temperature_c: 24.7,
    humidity_pct: 61.2,
    pressure_hpa: 1013.4,
    rain_mm: 0.4,
    uv_index: 5.3,
    ...overrides,
  };
}

describe("POST /api/v1/ingest (T3.5 — integração, Postgres real)", () => {
  let testPg: TestPostgres;
  let app: FastifyInstance;

  beforeAll(async () => {
    testPg = await startTestPostgres();
    await runMigrations(testPg.db);
  }, 90000);

  afterAll(async () => {
    await testPg.stop();
  }, 30000);

  beforeEach(() => {
    app = buildApp({
      readingRepository: new DrizzleReadingRepository(testPg.db),
      ingestApiKey: API_KEY,
      maxBatch: 5,
    });
  });

  afterEach(async () => {
    await app.close();
    await testPg.db.delete(readings);
    await testPg.db.delete(stations);
  });

  it("ING-01: fluxo feliz — 3 leituras novas → 202 { accepted:3, duplicates:0, rejected:[] }", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      payload: {
        station_id: "main",
        readings: [
          reading({ timestamp: minutesAgo(30) }),
          reading({ timestamp: minutesAgo(25) }),
          reading({ timestamp: minutesAgo(20) }),
        ],
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 3, duplicates: 0, rejected: [] });
  });

  it("ING-02: reenviar o mesmo lote é idempotente — 202 { accepted:0, duplicates:3 }", async () => {
    const payload = {
      station_id: "main",
      readings: [
        reading({ timestamp: minutesAgo(50) }),
        reading({ timestamp: minutesAgo(45) }),
        reading({ timestamp: minutesAgo(40) }),
      ],
    };
    const headers = { "x-api-key": API_KEY, "content-type": "application/json" };

    await app.inject({ method: "POST", url: "/api/v1/ingest", headers, payload });
    const second = await app.inject({ method: "POST", url: "/api/v1/ingest", headers, payload });

    expect(second.statusCode).toBe(202);
    expect(second.json()).toEqual({ accepted: 0, duplicates: 3, rejected: [] });
  });

  it("ING-03: 1 leitura inválida entre 2 válidas → 202 { accepted:2, rejected:[{index:1,...}] }, sem derrubar o lote", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      payload: {
        station_id: "main",
        readings: [
          reading({ timestamp: minutesAgo(15) }),
          reading({ timestamp: minutesAgo(10), temperature_c: 999 }),
          reading({ timestamp: minutesAgo(5) }),
        ],
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json() as { accepted: number; duplicates: number; rejected: unknown[] };
    expect(body.accepted).toBe(2);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]).toMatchObject({ index: 1 });
  });

  it("edge: readings:[] é um no-op válido → 202 { accepted:0, duplicates:0, rejected:[] }", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      payload: { station_id: "main", readings: [] },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 0, duplicates: 0, rejected: [] });
  });

  it("ING-04: sem header X-API-Key → 401, sem persistir nada", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "content-type": "application/json" },
      payload: { station_id: "main", readings: [reading()] },
    });

    expect(response.statusCode).toBe(401);

    const persisted = await testPg.db.select().from(readings);
    expect(persisted).toHaveLength(0);
  });

  it("ING-04: header X-API-Key errado → 401, sem persistir nada", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": "chave-errada", "content-type": "application/json" },
      payload: { station_id: "main", readings: [reading()] },
    });

    expect(response.statusCode).toBe(401);

    const persisted = await testPg.db.select().from(readings);
    expect(persisted).toHaveLength(0);
  });

  it("ING-06: corpo com estrutura inválida (station_id vazio) → 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      payload: { station_id: "", readings: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("ING-06: corpo com readings de tipo errado (não-array) → 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      payload: { station_id: "main", readings: "not-an-array" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("ING-06: corpo JSON válido mas que não é um objeto (null) → 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      payload: "null",
    });

    expect(response.statusCode).toBe(400);
  });

  it("edge: corpo não é JSON válido → 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      payload: "{ isso não é json",
    });

    expect(response.statusCode).toBe(400);
  });

  it("ING-08: lote acima do maxBatch configurado → 413, sem persistir nada", async () => {
    // app deste describe é criado com maxBatch:5 (ver beforeEach).
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      payload: {
        station_id: "main",
        readings: Array.from({ length: 6 }, (_, i) => reading({ timestamp: minutesAgo(100 + i) })),
      },
    });

    expect(response.statusCode).toBe(413);

    const persisted = await testPg.db.select().from(readings);
    expect(persisted).toHaveLength(0);
  });

  it("edge: duas leituras concorrentes com a mesma chave não geram erro 500 (ON CONFLICT DO NOTHING)", async () => {
    const payload = {
      station_id: "main",
      readings: [reading({ timestamp: minutesAgo(120) })],
    };
    const headers = { "x-api-key": API_KEY, "content-type": "application/json" };

    const [first, second] = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/ingest", headers, payload }),
      app.inject({ method: "POST", url: "/api/v1/ingest", headers, payload }),
    ]);

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);

    const totalAccepted =
      (first.json() as { accepted: number }).accepted +
      (second.json() as { accepted: number }).accepted;
    expect(totalAccepted).toBe(1);
  });
});

describe("POST /api/v1/ingest — station_id default (T3.5)", () => {
  let testPg: TestPostgres;
  let app: FastifyInstance;

  beforeAll(async () => {
    testPg = await startTestPostgres();
    await runMigrations(testPg.db);
    app = buildApp({
      readingRepository: new DrizzleReadingRepository(testPg.db),
      ingestApiKey: API_KEY,
      maxBatch: 5000,
    });
  }, 90000);

  afterAll(async () => {
    await app.close();
    await testPg.stop();
  }, 30000);

  it("usa station_id 'main' por default quando omitido", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      payload: { readings: [reading({ timestamp: minutesAgo(90) })] },
    });

    expect(response.statusCode).toBe(202);

    const persisted = await testPg.db.select().from(readings);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.stationId).toBe("main");
  });
});

describe("buildApp() sem nenhuma option explícita (default de produção — lazy getDb()/parseEnv())", () => {
  let testPg: TestPostgres;
  let app: FastifyInstance;
  let originalDatabaseUrl: string | undefined;
  let originalIngestApiKey: string | undefined;

  beforeAll(async () => {
    testPg = await startTestPostgres();
    await runMigrations(testPg.db);

    // Sem NENHUMA option explícita, buildApp() resolve tudo (repositório
    // Drizzle via getDb(), chave via parseEnv().INGEST_API_KEY, teto via
    // parseEnv().MAX_BATCH) de forma preguiçosa, só quando a rota é
    // chamada de fato — ver `lazyDrizzleReadingRepository`/`getIngestApiKey`/
    // `getMaxBatch` em app.ts. Este é o caminho real usado por server.ts.
    originalDatabaseUrl = process.env.DATABASE_URL;
    originalIngestApiKey = process.env.INGEST_API_KEY;
    process.env.DATABASE_URL = testPg.databaseUrl;
    process.env.INGEST_API_KEY = API_KEY;

    app = buildApp();
  }, 90000);

  afterAll(async () => {
    await app.close();
    // A rota chamou getDb() indiretamente (via lazyDrizzleReadingRepository
    // em app.ts), que cacheia um pg.Pool próprio (client.ts) — precisa ser
    // fechado explicitamente antes de derrubar o container, senão o
    // container mata a conexão viva e gera um unhandled error no teste.
    const { pool: lazyPool } = getDb();
    await closeDb(lazyPool);
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.INGEST_API_KEY = originalIngestApiKey;
    await testPg.stop();
  }, 30000);

  it("persiste usando o repositório Drizzle padrão resolvido a partir do env", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      payload: { station_id: "main", readings: [reading({ timestamp: minutesAgo(80) })] },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 1, duplicates: 0, rejected: [] });

    const persisted = await testPg.db.select().from(readings);
    expect(persisted).toHaveLength(1);
  });
});
