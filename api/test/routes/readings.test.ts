import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { runMigrations } from "../../src/db/migrate.js";
import { readings, stations } from "../../src/db/schema.js";
import { DrizzleReadingRepository } from "../../src/repositories/reading-repository.js";
import { startTestPostgres, type TestPostgres } from "../db/helpers/testPostgres.js";

const API_KEY = "whs_test_ABC123";

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

async function ingest(app: FastifyInstance, payload: Record<string, unknown>) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/ingest",
    headers: { "x-api-key": API_KEY, "content-type": "application/json" },
    payload,
  });
  expect(response.statusCode).toBe(202);
}

describe("GET /api/v1/readings/latest e /series (T4.4 — integração, Postgres real)", () => {
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
      maxBatch: 5000,
    });
  });

  afterEach(async () => {
    await app.close();
    await testPg.db.delete(readings);
    await testPg.db.delete(stations);
  });

  describe("GET /api/v1/readings/latest", () => {
    it("READ-03: estado vazio → 200 com todos os campos null (não 404)", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/readings/latest" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        station_id: "main",
        timestamp: null,
        age_seconds: null,
        temperature_c: null,
        humidity_pct: null,
        pressure_hpa: null,
        rain_mm: null,
        uv_index: null,
      });
    });

    it("READ-01: retorna a leitura mais recente após ingestão", async () => {
      const mostRecentTimestamp = minutesAgo(5);
      await ingest(app, {
        station_id: "main",
        readings: [
          reading({ timestamp: minutesAgo(30), temperature_c: 20 }),
          reading({ timestamp: mostRecentTimestamp, temperature_c: 25 }),
        ],
      });

      const response = await app.inject({ method: "GET", url: "/api/v1/readings/latest" });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { temperature_c: number; timestamp: string };
      expect(body.temperature_c).toBe(25);
      expect(new Date(body.timestamp).getTime()).toBe(new Date(mostRecentTimestamp).getTime());
    });

    it("define Cache-Control: no-store", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/readings/latest" });

      expect(response.headers["cache-control"]).toBe("no-store");
    });
  });

  describe("GET /api/v1/readings/series", () => {
    it("READ-07: metric inválida → 400", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/series?metric=nope&range=24h",
      });

      expect(response.statusCode).toBe(400);
    });

    it("READ-07: range inválido → 400", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/series?metric=temperature_c&range=1y",
      });

      expect(response.statusCode).toBe(400);
    });

    it("READ-08: sem dados no período → 200 com buckets: []", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/series?metric=temperature_c&range=24h",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        metric: "temperature_c",
        range: "24h",
        bucket: "hour",
        buckets: [],
      });
    });

    it("range=24h agrega por hora após ingestão", async () => {
      await ingest(app, {
        station_id: "main",
        readings: [
          reading({ timestamp: minutesAgo(90), temperature_c: 20 }),
          reading({ timestamp: minutesAgo(80), temperature_c: 24 }),
        ],
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/series?metric=temperature_c&range=24h",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { bucket: string; buckets: unknown[] };
      expect(body.bucket).toBe("hour");
      expect(body.buckets).toHaveLength(1);
      expect(body.buckets[0]).toMatchObject({ avg: 22, min: 20, max: 24 });
    });

    it("range=30d agrega por dia", async () => {
      await ingest(app, {
        station_id: "main",
        readings: [reading({ timestamp: minutesAgo(60), temperature_c: 20 })],
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/series?metric=temperature_c&range=30d",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { bucket: string };
      expect(body.bucket).toBe("day");
    });

    it("READ-10: rain_mm expõe sum agregado", async () => {
      await ingest(app, {
        station_id: "main",
        readings: [
          reading({ timestamp: minutesAgo(90), rain_mm: 1.5, temperature_c: null }),
          reading({ timestamp: minutesAgo(85), rain_mm: 2.5, temperature_c: null }),
        ],
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/series?metric=rain_mm&range=24h",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { buckets: Array<{ sum: number }> };
      expect(body.buckets[0]?.sum).toBe(4);
    });

    it("define Cache-Control: no-store", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/series?metric=temperature_c&range=24h",
      });

      expect(response.headers["cache-control"]).toBe("no-store");
    });
  });
});
