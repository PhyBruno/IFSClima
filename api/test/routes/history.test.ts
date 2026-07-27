import ExcelJS from "exceljs";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { runMigrations } from "../../src/db/migrate.js";
import { readings, stations } from "../../src/db/schema.js";
import { DrizzleReadingRepository } from "../../src/repositories/reading-repository.js";
import { startTestPostgres, type TestPostgres } from "../db/helpers/testPostgres.js";

const API_KEY = "whs_test_ABC123";

function reading(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: "2026-07-23T14:30:00.000Z",
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

describe("GET /api/v1/readings e /export (T8.5 — integração, Postgres real)", () => {
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

  describe("GET /api/v1/readings", () => {
    it("HIST-01/HIST-02: lista paginada, ordenada, com total do intervalo inteiro", async () => {
      await ingest(app, {
        station_id: "main",
        readings: [
          reading({ timestamp: "2026-07-23T10:00:00.000Z", temperature_c: 1 }),
          reading({ timestamp: "2026-07-23T11:00:00.000Z", temperature_c: 2 }),
          reading({ timestamp: "2026-07-23T12:00:00.000Z", temperature_c: 3 }),
        ],
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings?from=2026-07-23T00:00:00.000Z&to=2026-07-24T00:00:00.000Z&page=1&page_size=2&order=asc",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        from: string;
        to: string;
        page: number;
        page_size: number;
        total: number;
        readings: Array<{ temperature_c: number }>;
      };
      expect(body.page).toBe(1);
      expect(body.page_size).toBe(2);
      expect(body.total).toBe(3);
      expect(body.readings).toHaveLength(2);
      expect(body.readings.map((r) => r.temperature_c)).toEqual([1, 2]);
    });

    it("HIST-03/HIST-04: intervalo vazio → 200 com readings: [] e total: 0 (não erro)", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings?from=2020-01-01T00:00:00.000Z&to=2020-01-02T00:00:00.000Z",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ total: 0, readings: [] });
    });

    it("sensor nulo é preservado como null na resposta (UI decide exibir '—')", async () => {
      await ingest(app, {
        station_id: "main",
        readings: [
          reading({
            timestamp: "2026-07-23T10:00:00.000Z",
            temperature_c: null,
          }),
        ],
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings?from=2026-07-23T00:00:00.000Z&to=2026-07-24T00:00:00.000Z",
      });

      const body = response.json() as { readings: Array<{ temperature_c: number | null }> };
      expect(body.readings[0]?.temperature_c).toBeNull();
    });

    it("HIST-10: from > to → 400", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings?from=2026-07-24T00:00:00.000Z&to=2026-07-23T00:00:00.000Z",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty("issues");
    });

    it("HIST-10: page inválida (0) → 400", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/readings?page=0" });

      expect(response.statusCode).toBe(400);
    });

    it("HIST-10: page_size acima do teto (501) → 400", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/readings?page_size=501" });

      expect(response.statusCode).toBe(400);
    });

    it("achado F8 #2: to sozinho no passado distante → 400 (não 200 com total:0 e from > to silencioso)", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings?to=2000-01-15T00:00:00.000Z",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty("issues");
    });

    it("from/to ambos ausentes continua 200 com default de últimas 24h (não regride HIST-05)", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/readings" });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { total: number; readings: unknown[] };
      expect(body.total).toBe(0);
      expect(body.readings).toEqual([]);
    });

    it("define Cache-Control: no-store", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/readings" });

      expect(response.headers["cache-control"]).toBe("no-store");
    });
  });

  describe("GET /api/v1/readings/export", () => {
    it("HIST-06/HIST-08: format=csv baixa todas as leituras do intervalo com headers corretos", async () => {
      await ingest(app, {
        station_id: "main",
        readings: [
          reading({ timestamp: "2026-07-23T10:00:00.000Z", temperature_c: 1 }),
          reading({ timestamp: "2026-07-23T11:00:00.000Z", temperature_c: 2, humidity_pct: null }),
        ],
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/export?from=2026-07-23T00:00:00.000Z&to=2026-07-24T00:00:00.000Z&format=csv",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(response.headers["content-disposition"]).toBe(
        'attachment; filename="readings_2026-07-23_2026-07-24.csv"',
      );

      const lines = response.body.trim().split("\n");
      expect(lines[0]).toBe("timestamp,temperature_c,humidity_pct,pressure_hpa,rain_mm,uv_index");
      expect(lines).toHaveLength(3);
      expect(lines[1]).toBe("2026-07-23T10:00:00.000Z,1,61.2,1013.4,0.4,5.3");
      expect(lines[2]).toBe("2026-07-23T11:00:00.000Z,2,,1013.4,0.4,5.3");
    });

    it("HIST-08: intervalo vazio → CSV só com cabeçalho", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/export?from=2020-01-01T00:00:00.000Z&to=2020-01-02T00:00:00.000Z&format=csv",
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.trim()).toBe(
        "timestamp,temperature_c,humidity_pct,pressure_hpa,rain_mm,uv_index",
      );
    });

    it("HIST-07: format=xlsx baixa arquivo válido com headers corretos", async () => {
      await ingest(app, {
        station_id: "main",
        readings: [reading({ timestamp: "2026-07-23T10:00:00.000Z", temperature_c: 5 })],
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/export?from=2026-07-23T00:00:00.000Z&to=2026-07-24T00:00:00.000Z&format=xlsx",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(response.headers["content-disposition"]).toBe(
        'attachment; filename="readings_2026-07-23_2026-07-24.xlsx"',
      );

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(response.rawPayload));
      const sheet = workbook.getWorksheet("Leituras");
      expect(sheet?.rowCount).toBe(2);
      expect(sheet?.getRow(2).getCell(2).value).toBe(5);
    });

    it("HIST-10: format inválido → 400", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/export?format=pdf",
      });

      expect(response.statusCode).toBe(400);
    });

    it("HIST-10: from > to → 400", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/export?from=2026-07-24T00:00:00.000Z&to=2026-07-23T00:00:00.000Z",
      });

      expect(response.statusCode).toBe(400);
    });

    it("achado F8 #1: from sozinho a >366 dias de 'agora' → 400 (não inicia streaming de export gigante)", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/export?from=2000-01-01T00:00:00.000Z",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty("issues");
    });

    it("achado F8 #2: to sozinho no passado distante → 400 (não 200 com from > to silencioso)", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/readings/export?to=2000-01-15T00:00:00.000Z",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty("issues");
    });
  });
});
