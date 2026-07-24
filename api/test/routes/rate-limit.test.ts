import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type {
  NewReadingRow,
  ReadingRepository,
  LatestReadingRow,
  AggregateBucketRow,
  FindRangeParams,
  FindRangeResult,
  ReadingRow,
  BucketUnit,
} from "../../src/repositories/reading-repository.js";
import type { Metric } from "../../src/schemas/readings.js";
import type { Order } from "../../src/schemas/history.js";

const API_KEY = "whs_test_ABC123";

/**
 * Fake em memória, só o suficiente para exercitar `POST /api/v1/ingest`
 * (métodos de leitura/histórico não são usados por este teste — o alvo é
 * o rate limit da rota de ingestão, QA-07 — e por isso lançam se chamados).
 */
class FakeReadingRepository implements ReadingRepository {
  private readonly persisted = new Set<string>();

  async ensureStation(): Promise<void> {
    // no-op
  }

  async insertIgnoreConflicts(rows: NewReadingRow[]): Promise<number> {
    let inserted = 0;
    for (const row of rows) {
      const key = `${row.stationId}|${row.timestamp.toISOString()}`;
      if (this.persisted.has(key)) continue;
      this.persisted.add(key);
      inserted += 1;
    }
    return inserted;
  }

  findLatest(): Promise<LatestReadingRow | null> {
    throw new Error("not used by rate-limit tests");
  }

  aggregate(
    _stationId: string,
    _metric: Metric,
    _since: Date,
    _bucketUnit: BucketUnit,
  ): Promise<AggregateBucketRow[]> {
    throw new Error("not used by rate-limit tests");
  }

  findRange(_params: FindRangeParams): Promise<FindRangeResult> {
    throw new Error("not used by rate-limit tests");
  }

  streamRange(_stationId: string, _from: Date, _to: Date, _order: Order): AsyncIterable<ReadingRow> {
    throw new Error("not used by rate-limit tests");
  }
}

function reading(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    temperature_c: 24.7,
    humidity_pct: 61.2,
    pressure_hpa: 1013.4,
    rain_mm: 0.4,
    uv_index: 5.3,
    ...overrides,
  };
}

describe("POST /api/v1/ingest — rate limiting (T7.2 — QA-07)", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({
      readingRepository: new FakeReadingRepository(),
      ingestApiKey: API_KEY,
      maxBatch: 5000,
      // Limite bem baixo só para tornar o teste determinístico e rápido
      // (o default de produção é 100 req/min — ver config/env.ts).
      rateLimit: { max: 3, timeWindow: 1000 },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("edge: WHEN a estação manda lote enorme repetidamente THEN a partir do limite responde 429", async () => {
    const payload = { station_id: "main", readings: [reading()] };
    const headers = { "x-api-key": API_KEY, "content-type": "application/json" };

    const responses = [];
    for (let i = 0; i < 4; i += 1) {
      responses.push(await app.inject({ method: "POST", url: "/api/v1/ingest", headers, payload }));
    }

    const statuses = responses.map((r) => r.statusCode);
    expect(statuses.slice(0, 3)).toEqual([202, 202, 202]);
    expect(statuses[3]).toBe(429);
  });

  it("não afeta outras rotas (ex.: GET /health não é limitado pelo rate limit de ingestão)", async () => {
    const payload = { station_id: "main", readings: [reading()] };
    const headers = { "x-api-key": API_KEY, "content-type": "application/json" };

    for (let i = 0; i < 5; i += 1) {
      await app.inject({ method: "POST", url: "/api/v1/ingest", headers, payload });
    }

    const health = await app.inject({ method: "GET", url: "/health" });
    // /health não usa checkDb configurado aqui, então pode ser 503 (sem
    // banco) — o ponto do teste é que NÃO é 429 (rate limit não vaza p/ cá).
    expect(health.statusCode).not.toBe(429);
  });
});
