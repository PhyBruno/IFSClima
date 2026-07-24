import { describe, expect, it } from "vitest";
import type {
  AggregateBucketRow,
  BucketUnit,
  LatestReadingRow,
  ReadingRepository,
} from "../../src/repositories/reading-repository.js";
import type { Metric } from "../../src/schemas/readings.js";
import { createReadingsService } from "../../src/services/readings-service.js";

class FakeReadingRepository implements ReadingRepository {
  latest: LatestReadingRow | null = null;
  aggregateResult: AggregateBucketRow[] = [];
  aggregateCalls: Array<{
    stationId: string;
    metric: Metric;
    since: Date;
    bucketUnit: BucketUnit;
  }> = [];

  async ensureStation(): Promise<void> {}

  async insertIgnoreConflicts(): Promise<number> {
    return 0;
  }

  async findLatest(): Promise<LatestReadingRow | null> {
    return this.latest;
  }

  async aggregate(
    stationId: string,
    metric: Metric,
    since: Date,
    bucketUnit: BucketUnit,
  ): Promise<AggregateBucketRow[]> {
    this.aggregateCalls.push({ stationId, metric, since, bucketUnit });
    return this.aggregateResult;
  }
}

const NOW = new Date("2026-07-23T15:00:00.000Z");

function latestRow(overrides: Partial<LatestReadingRow> = {}): LatestReadingRow {
  return {
    timestamp: new Date("2026-07-23T14:30:00.000Z"),
    temperatureC: 24.7,
    humidityPct: 61.2,
    pressureHpa: 1013.4,
    rainMm: 0.4,
    uvIndex: 5.3,
    ...overrides,
  };
}

describe("ReadingsService.getLatest (T4.3 — READ-01..04)", () => {
  it("READ-03: retorna todos os campos null quando não há leitura", async () => {
    const repo = new FakeReadingRepository();
    const service = createReadingsService(repo, () => NOW);

    const result = await service.getLatest("main");

    expect(result).toEqual({
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

  it("READ-01/READ-04: retorna a leitura com age_seconds calculado", async () => {
    const repo = new FakeReadingRepository();
    repo.latest = latestRow();
    const service = createReadingsService(repo, () => NOW);

    const result = await service.getLatest("main");

    expect(result).toEqual({
      station_id: "main",
      timestamp: "2026-07-23T14:30:00.000Z",
      age_seconds: 1800,
      temperature_c: 24.7,
      humidity_pct: 61.2,
      pressure_hpa: 1013.4,
      rain_mm: 0.4,
      uv_index: 5.3,
    });
  });

  it("READ-02: sensor ausente na última leitura vem null (não omitido)", async () => {
    const repo = new FakeReadingRepository();
    repo.latest = latestRow({ temperatureC: null });
    const service = createReadingsService(repo, () => NOW);

    const result = await service.getLatest("main");

    expect(result.temperature_c).toBeNull();
  });

  it("nunca reporta age_seconds negativo (proteção contra relógio atrasado)", async () => {
    const repo = new FakeReadingRepository();
    repo.latest = latestRow({ timestamp: new Date("2026-07-23T15:00:05.000Z") });
    const service = createReadingsService(repo, () => NOW);

    const result = await service.getLatest("main");

    expect(result.age_seconds).toBe(0);
  });
});

describe("ReadingsService.getSeries (T4.3 — READ-05, READ-06, READ-08, READ-09, READ-10)", () => {
  it("READ-06: range=24h usa lookback de 24h e bucket 'hour'", async () => {
    const repo = new FakeReadingRepository();
    const service = createReadingsService(repo, () => NOW);

    await service.getSeries("main", "temperature_c", "24h");

    expect(repo.aggregateCalls).toHaveLength(1);
    expect(repo.aggregateCalls[0]?.bucketUnit).toBe("hour");
    expect(repo.aggregateCalls[0]?.since).toEqual(new Date("2026-07-22T15:00:00.000Z"));
  });

  it("READ-06: range=7d usa lookback de 7 dias e bucket 'hour'", async () => {
    const repo = new FakeReadingRepository();
    const service = createReadingsService(repo, () => NOW);

    await service.getSeries("main", "temperature_c", "7d");

    expect(repo.aggregateCalls[0]?.bucketUnit).toBe("hour");
    expect(repo.aggregateCalls[0]?.since).toEqual(new Date("2026-07-16T15:00:00.000Z"));
  });

  it("READ-06: range=30d usa lookback de 30 dias e bucket 'day'", async () => {
    const repo = new FakeReadingRepository();
    const service = createReadingsService(repo, () => NOW);

    await service.getSeries("main", "temperature_c", "30d");

    expect(repo.aggregateCalls[0]?.bucketUnit).toBe("day");
    expect(repo.aggregateCalls[0]?.since).toEqual(new Date("2026-06-23T15:00:00.000Z"));
  });

  it("READ-05: mapeia buckets do repositório para a resposta com t/avg/min/max/sum", async () => {
    const repo = new FakeReadingRepository();
    repo.aggregateResult = [
      { bucket: new Date("2026-07-23T14:00:00.000Z"), avg: 22, min: 20, max: 24, sum: null },
    ];
    const service = createReadingsService(repo, () => NOW);

    const result = await service.getSeries("main", "temperature_c", "24h");

    expect(result).toEqual({
      metric: "temperature_c",
      range: "24h",
      bucket: "hour",
      buckets: [{ t: "2026-07-23T14:00:00.000Z", avg: 22, min: 20, max: 24, sum: null }],
    });
  });

  it("READ-08: período vazio → buckets: []", async () => {
    const repo = new FakeReadingRepository();
    repo.aggregateResult = [];
    const service = createReadingsService(repo, () => NOW);

    const result = await service.getSeries("main", "temperature_c", "24h");

    expect(result.buckets).toEqual([]);
  });

  it("READ-10: repassa sum para rain_mm sem inventar valor", async () => {
    const repo = new FakeReadingRepository();
    repo.aggregateResult = [
      { bucket: new Date("2026-07-23T14:00:00.000Z"), avg: 2, min: 1.5, max: 2.5, sum: 4 },
    ];
    const service = createReadingsService(repo, () => NOW);

    const result = await service.getSeries("main", "rain_mm", "24h");

    expect(result.buckets[0]?.sum).toBe(4);
  });

  it("READ-09: não preenche lacunas — número de buckets retornados é igual ao do repositório", async () => {
    const repo = new FakeReadingRepository();
    repo.aggregateResult = [
      { bucket: new Date("2026-07-23T10:00:00.000Z"), avg: 20, min: 20, max: 20, sum: null },
      { bucket: new Date("2026-07-23T14:00:00.000Z"), avg: 24, min: 24, max: 24, sum: null },
    ];
    const service = createReadingsService(repo, () => NOW);

    const result = await service.getSeries("main", "temperature_c", "24h");

    expect(result.buckets).toHaveLength(2);
  });
});
