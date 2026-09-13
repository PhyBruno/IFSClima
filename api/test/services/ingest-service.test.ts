import { describe, expect, it } from "vitest";
import type {
  NewReadingRow,
  ReadingRepository,
} from "../../src/repositories/reading-repository.js";
import { createIngestService, validateReading } from "../../src/services/ingest-service.js";
import type { IngestRequest } from "../../src/schemas/ingest.js";

/**
 * Fake em memória de `ReadingRepository` — replica a semântica do
 * `ON CONFLICT (station_id,timestamp) DO NOTHING` do Postgres real (T3.2)
 * sem precisar de banco, para testar `IngestService` isoladamente.
 */
class FakeReadingRepository implements ReadingRepository {
  readonly stations = new Set<string>();
  private readonly persisted = new Set<string>();
  ensureStationCalls = 0;
  insertCalls = 0;
  /** Linhas da última chamada a `insertIgnoreConflicts`. */
  lastRows: NewReadingRow[] = [];

  async ensureStation(id: string): Promise<void> {
    this.ensureStationCalls += 1;
    this.stations.add(id);
  }

  async insertIgnoreConflicts(rows: NewReadingRow[]): Promise<number> {
    this.insertCalls += 1;
    this.lastRows = rows;
    let inserted = 0;

    for (const row of rows) {
      const key = `${row.stationId}|${row.timestamp.toISOString()}`;
      if (this.persisted.has(key)) {
        continue;
      }
      this.persisted.add(key);
      inserted += 1;
    }

    return inserted;
  }
}

function reading(overrides: Partial<IngestRequest["readings"][number]> = {}) {
  return {
    timestamp: "2026-07-23T14:30:00.000Z",
    temperature_c: 24.7,
    humidity_pct: 61.2,
    pressure_hpa: 1013.4,
    rain_mm: 0.4,
    uv_index: 5.3,
    uv_voltage_v: 0.632,
    ...overrides,
  };
}

const NOW = new Date("2026-07-23T15:00:00.000Z");

describe("IngestService (T3.3 — ING-01, ING-03, ING-07, ING-09, ING-10)", () => {
  it("ING-01: persiste 3 leituras novas e retorna accepted:3, duplicates:0, rejected:[]", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({
      station_id: "main",
      readings: [
        reading({ timestamp: "2026-07-23T14:30:00.000Z" }),
        reading({ timestamp: "2026-07-23T14:35:00.000Z" }),
        reading({ timestamp: "2026-07-23T14:40:00.000Z" }),
      ],
    });

    expect(result).toEqual({ accepted: 3, duplicates: 0, rejected: [] });
  });

  it("ING-02: reenviar o mesmo lote é idempotente (accepted:0, duplicates:N)", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);
    const request: IngestRequest = {
      station_id: "main",
      readings: [
        reading({ timestamp: "2026-07-23T14:30:00.000Z" }),
        reading({ timestamp: "2026-07-23T14:35:00.000Z" }),
        reading({ timestamp: "2026-07-23T14:40:00.000Z" }),
      ],
    };

    await service.ingest(request);
    const second = await service.ingest(request);

    expect(second).toEqual({ accepted: 0, duplicates: 3, rejected: [] });
  });

  it("ING-03/ING-07: 1 leitura inválida entre 2 válidas → accepted:2, rejected:[{index:1,...}], sem derrubar o lote", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({
      station_id: "main",
      readings: [
        reading({ timestamp: "2026-07-23T14:30:00.000Z" }),
        reading({ timestamp: "2026-07-23T14:35:00.000Z", temperature_c: 999 }),
        reading({ timestamp: "2026-07-23T14:40:00.000Z" }),
      ],
    });

    expect(result.accepted).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ index: 1 });
    expect(result.rejected[0]?.reason).toMatch(/temperature_c/);
  });

  it("ING-09: dedupe intra-lote — 2 leituras idênticas no mesmo POST contam 1 accepted + 1 duplicate", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({
      station_id: "main",
      readings: [
        reading({ timestamp: "2026-07-23T14:30:00.000Z" }),
        reading({ timestamp: "2026-07-23T14:30:00.000Z" }),
      ],
    });

    expect(result).toEqual({ accepted: 1, duplicates: 1, rejected: [] });
  });

  it("ING-10: timestamp mais de 5 minutos no futuro é rejeitado", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({
      station_id: "main",
      readings: [reading({ timestamp: "2026-07-23T15:10:00.000Z" })],
    });

    expect(result.accepted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toMatch(/future/);
  });

  it("aceita timestamp dentro da tolerância de clock (+5min exatos não é 'futuro demais')", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({
      station_id: "main",
      readings: [reading({ timestamp: "2026-07-23T15:04:00.000Z" })],
    });

    expect(result.accepted).toBe(1);
    expect(result.rejected).toEqual([]);
  });

  it("edge: readings:[] é um no-op válido (accepted:0, duplicates:0, rejected:[]) e não toca o repositório", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({ station_id: "main", readings: [] });

    expect(result).toEqual({ accepted: 0, duplicates: 0, rejected: [] });
    expect(repo.ensureStationCalls).toBe(0);
    expect(repo.insertCalls).toBe(0);
  });

  it.each([
    ["temperature_c", -90.01],
    ["temperature_c", 60.01],
    ["humidity_pct", -0.01],
    ["humidity_pct", 100.01],
    ["pressure_hpa", 299.99],
    ["pressure_hpa", 1100.01],
    ["rain_mm", -0.01],
    ["uv_index", -0.01],
    ["uv_index", 20.01],
    ["uv_voltage_v", -0.01],
    ["uv_voltage_v", 5.01],
  ] as const)("ING-07: rejeita %s fora da faixa física (%f)", async (field, value) => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({
      station_id: "main",
      readings: [reading({ [field]: value } as Partial<IngestRequest["readings"][number]>)],
    });

    expect(result.accepted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toMatch(new RegExp(field));
  });

  it.each([
    ["temperature_c", -90],
    ["temperature_c", 60],
    ["humidity_pct", 0],
    ["humidity_pct", 100],
    ["pressure_hpa", 300],
    ["pressure_hpa", 1100],
    ["rain_mm", 0],
    ["uv_index", 0],
    ["uv_index", 20],
    ["uv_voltage_v", 0],
    ["uv_voltage_v", 5],
  ] as const)("ING-07: aceita %s no limite exato da faixa física (%f)", async (field, value) => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({
      station_id: "main",
      readings: [reading({ [field]: value } as Partial<IngestRequest["readings"][number]>)],
    });

    expect(result.rejected).toEqual([]);
    expect(result.accepted).toBe(1);
  });

  it("ING-07: rain_mm não tem teto superior (PROJECT.md — [0, ∞)) — valor alto é aceito", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({
      station_id: "main",
      readings: [reading({ rain_mm: 3000 })],
    });

    expect(result).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
  });

  it("ING-07: rain_mm negativo continua rejeitado mesmo sem teto superior", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({
      station_id: "main",
      readings: [reading({ rain_mm: -1 })],
    });

    expect(result.accepted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toMatch(/rain_mm/);
  });

  it("aceita leitura com sensores nulos (sensor falhou) sem rejeitar por faixa", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    const result = await service.ingest({
      station_id: "main",
      readings: [
        reading({
          temperature_c: null,
          humidity_pct: null,
          pressure_hpa: null,
          rain_mm: null,
          uv_index: null,
          uv_voltage_v: null,
        }),
      ],
    });

    expect(result).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
  });

  it("normaliza timestamp com offset não-UTC para UTC antes de persistir/deduplicar", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    // 11:30 UTC-3 == 14:30Z (mesmo instante, ambos antes de NOW = 15:00Z)
    const result = await service.ingest({
      station_id: "main",
      readings: [
        reading({ timestamp: "2026-07-23T11:30:00.000-03:00" }),
        reading({ timestamp: "2026-07-23T14:30:00.000Z" }),
      ],
    });

    // Ambas as leituras representam o mesmo instante → dedupe intra-lote.
    expect(result).toEqual({ accepted: 1, duplicates: 1, rejected: [] });
  });

  it("garante a estação (ensureStation) antes de inserir quando há leituras válidas", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    await service.ingest({ station_id: "main", readings: [reading()] });

    expect(repo.ensureStationCalls).toBe(1);
    expect(repo.stations.has("main")).toBe(true);
  });
});

describe("uv_voltage_v (tensao bruta do sensor UV)", () => {
  it("persiste a tensao bruta junto com o indice", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);

    await service.ingest({
      station_id: "main",
      readings: [reading({ uv_index: 5.3, uv_voltage_v: 0.632 })],
    });

    expect(repo.lastRows[0]?.uvVoltageV).toBe(0.632);
    expect(repo.lastRows[0]?.uvIndex).toBe(5.3);
  });

  it("persiste null quando a estacao nao manda a tensao (sensor UV ausente)", async () => {
    const repo = new FakeReadingRepository();
    const service = createIngestService(repo, () => NOW);
    const semTensao = reading();
    delete (semTensao as Record<string, unknown>).uv_voltage_v;

    await service.ingest({ station_id: "main", readings: [semTensao] });

    expect(repo.lastRows[0]?.uvVoltageV).toBeNull();
  });
});

describe("validateReading (defesa em profundidade além do Zod)", () => {
  it("rejeita timestamp que não é uma data parseável (proteção caso escape do Zod)", () => {
    const outcome = validateReading({ ...reading(), timestamp: "not-a-valid-date" }, NOW);

    expect(outcome).toEqual({ valid: false, reason: "timestamp is invalid" });
  });
});
