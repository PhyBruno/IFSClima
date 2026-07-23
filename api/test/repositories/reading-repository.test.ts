import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrate.js";
import { readings, stations } from "../../src/db/schema.js";
import {
  CHUNK_SIZE,
  DrizzleReadingRepository,
  type NewReadingRow,
} from "../../src/repositories/reading-repository.js";
import { startTestPostgres, type TestPostgres } from "../db/helpers/testPostgres.js";

function row(overrides: Partial<NewReadingRow> = {}): NewReadingRow {
  return {
    stationId: "main",
    timestamp: new Date("2026-07-23T14:30:00.000Z"),
    temperatureC: 24.7,
    humidityPct: 61.2,
    pressureHpa: 1013.4,
    rainMm: 0.4,
    uvIndex: 5.3,
    ...overrides,
  };
}

describe("DrizzleReadingRepository (T3.2 — ING-02, ING-09, DB-01)", () => {
  let testPg: TestPostgres;
  let repository: DrizzleReadingRepository;

  beforeAll(async () => {
    testPg = await startTestPostgres();
    await runMigrations(testPg.db);
    repository = new DrizzleReadingRepository(testPg.db);
  }, 90000);

  afterAll(async () => {
    await testPg.stop();
  }, 30000);

  beforeEach(async () => {
    await testPg.db.delete(readings);
    await testPg.db.delete(stations);
  });

  describe("ensureStation", () => {
    it("cria a estação quando ela não existe", async () => {
      await repository.ensureStation("main");

      const rows = await testPg.db.select().from(stations).where(eq(stations.id, "main"));
      expect(rows).toHaveLength(1);
    });

    it("é idempotente: chamar duas vezes não duplica nem lança erro", async () => {
      await repository.ensureStation("main");
      await expect(repository.ensureStation("main")).resolves.toBeUndefined();

      const rows = await testPg.db.select().from(stations).where(eq(stations.id, "main"));
      expect(rows).toHaveLength(1);
    });

    it("não sobrescreve o nome de uma estação já existente", async () => {
      await testPg.db.insert(stations).values({ id: "main", name: "Nome Curado (synthetic)" });

      await repository.ensureStation("main");

      const rows = await testPg.db.select().from(stations).where(eq(stations.id, "main"));
      expect(rows[0]?.name).toBe("Nome Curado (synthetic)");
    });
  });

  describe("insertIgnoreConflicts", () => {
    beforeEach(async () => {
      await repository.ensureStation("main");
    });

    it("insere N linhas novas e retorna N", async () => {
      const rows: NewReadingRow[] = [
        row({ timestamp: new Date("2026-07-23T14:30:00.000Z") }),
        row({ timestamp: new Date("2026-07-23T14:35:00.000Z") }),
        row({ timestamp: new Date("2026-07-23T14:40:00.000Z") }),
      ];

      const inserted = await repository.insertIgnoreConflicts(rows);

      expect(inserted).toBe(3);
    });

    it("reinserir o mesmo lote retorna 0 (idempotência — ING-02)", async () => {
      const rows: NewReadingRow[] = [
        row({ timestamp: new Date("2026-07-23T15:00:00.000Z") }),
        row({ timestamp: new Date("2026-07-23T15:05:00.000Z") }),
      ];

      await repository.insertIgnoreConflicts(rows);
      const second = await repository.insertIgnoreConflicts(rows);

      expect(second).toBe(0);

      const persisted = await testPg.db
        .select()
        .from(readings)
        .where(eq(readings.stationId, "main"));
      expect(persisted).toHaveLength(2);
    });

    it("mistura de novas e já existentes retorna apenas a contagem das novas", async () => {
      const existing = row({ timestamp: new Date("2026-07-23T16:00:00.000Z") });
      await repository.insertIgnoreConflicts([existing]);

      const batch: NewReadingRow[] = [
        existing,
        row({ timestamp: new Date("2026-07-23T16:05:00.000Z") }),
        row({ timestamp: new Date("2026-07-23T16:10:00.000Z") }),
      ];

      const inserted = await repository.insertIgnoreConflicts(batch);

      expect(inserted).toBe(2);
    });

    it("retorna 0 sem lançar erro para um lote vazio", async () => {
      await expect(repository.insertIgnoreConflicts([])).resolves.toBe(0);
    });

    it("processa um lote maior que CHUNK_SIZE em múltiplos chunks e conta corretamente", async () => {
      const total = CHUNK_SIZE * 2 + 500; // força >= 3 chunks
      const base = new Date("2026-01-01T00:00:00.000Z").getTime();
      const rows: NewReadingRow[] = Array.from({ length: total }, (_, index) =>
        row({ timestamp: new Date(base + index * 60000) }),
      );

      const inserted = await repository.insertIgnoreConflicts(rows);

      expect(inserted).toBe(total);

      const persisted = await testPg.db
        .select()
        .from(readings)
        .where(eq(readings.stationId, "main"));
      expect(persisted).toHaveLength(total);
    });

    it("lote de exatamente 5000 leituras novas é aceito integralmente", async () => {
      const base = new Date("2027-01-01T00:00:00.000Z").getTime();
      const rows: NewReadingRow[] = Array.from({ length: 5000 }, (_, index) =>
        row({ timestamp: new Date(base + index * 1000) }),
      );

      const inserted = await repository.insertIgnoreConflicts(rows);

      expect(inserted).toBe(5000);
    }, 30000);

    it("persiste sensores nulos corretamente", async () => {
      const ts = new Date("2026-07-23T17:00:00.000Z");
      const inserted = await repository.insertIgnoreConflicts([
        row({
          timestamp: ts,
          temperatureC: null,
          humidityPct: null,
          pressureHpa: null,
          rainMm: null,
          uvIndex: null,
        }),
      ]);

      expect(inserted).toBe(1);

      const [persisted] = await testPg.db.select().from(readings).where(eq(readings.timestamp, ts));
      expect(persisted?.temperatureC).toBeNull();
    });
  });

  describe("findLatest", () => {
    beforeEach(async () => {
      await repository.ensureStation("main");
    });

    it("retorna null quando a estação não tem nenhuma leitura (READ-03)", async () => {
      await expect(repository.findLatest("main")).resolves.toBeNull();
    });

    it("retorna a leitura de maior timestamp (READ-01)", async () => {
      await repository.insertIgnoreConflicts([
        row({ timestamp: new Date("2026-07-23T14:00:00.000Z"), temperatureC: 20 }),
        row({ timestamp: new Date("2026-07-23T16:00:00.000Z"), temperatureC: 25 }),
        row({ timestamp: new Date("2026-07-23T15:00:00.000Z"), temperatureC: 22 }),
      ]);

      const latest = await repository.findLatest("main");

      expect(latest?.timestamp).toEqual(new Date("2026-07-23T16:00:00.000Z"));
      expect(latest?.temperatureC).toBe(25);
    });

    it("não retorna leitura de outra estação (READ-01)", async () => {
      await repository.ensureStation("other");
      await repository.insertIgnoreConflicts([
        row({
          stationId: "other",
          timestamp: new Date("2026-07-23T18:00:00.000Z"),
          temperatureC: 99,
        }),
      ]);

      await expect(repository.findLatest("main")).resolves.toBeNull();
    });

    it("retorna sensores nulos quando a última leitura tem sensor ausente (READ-02)", async () => {
      await repository.insertIgnoreConflicts([
        row({
          timestamp: new Date("2026-07-23T14:00:00.000Z"),
          temperatureC: null,
        }),
      ]);

      const latest = await repository.findLatest("main");

      expect(latest?.temperatureC).toBeNull();
    });
  });

  describe("aggregate", () => {
    beforeEach(async () => {
      await repository.ensureStation("main");
    });

    it("agrupa por hora e calcula avg/min/max (READ-05, READ-06)", async () => {
      await repository.insertIgnoreConflicts([
        row({ timestamp: new Date("2026-07-23T14:10:00.000Z"), temperatureC: 20 }),
        row({ timestamp: new Date("2026-07-23T14:40:00.000Z"), temperatureC: 24 }),
        row({ timestamp: new Date("2026-07-23T15:10:00.000Z"), temperatureC: 30 }),
      ]);

      const buckets = await repository.aggregate(
        "main",
        "temperature_c",
        new Date("2026-07-23T00:00:00.000Z"),
        "hour",
      );

      expect(buckets).toEqual([
        {
          bucket: new Date("2026-07-23T14:00:00.000Z"),
          avg: 22,
          min: 20,
          max: 24,
          sum: null,
        },
        {
          bucket: new Date("2026-07-23T15:00:00.000Z"),
          avg: 30,
          min: 30,
          max: 30,
          sum: null,
        },
      ]);
    });

    it("agrupa por dia (READ-06)", async () => {
      await repository.insertIgnoreConflicts([
        row({ timestamp: new Date("2026-07-23T01:00:00.000Z"), temperatureC: 10 }),
        row({ timestamp: new Date("2026-07-23T23:00:00.000Z"), temperatureC: 20 }),
        row({ timestamp: new Date("2026-07-24T05:00:00.000Z"), temperatureC: 30 }),
      ]);

      const buckets = await repository.aggregate(
        "main",
        "temperature_c",
        new Date("2026-07-01T00:00:00.000Z"),
        "day",
      );

      expect(buckets).toEqual([
        { bucket: new Date("2026-07-23T00:00:00.000Z"), avg: 15, min: 10, max: 20, sum: null },
        { bucket: new Date("2026-07-24T00:00:00.000Z"), avg: 30, min: 30, max: 30, sum: null },
      ]);
    });

    it("expõe sum para rain_mm (READ-10)", async () => {
      await repository.insertIgnoreConflicts([
        row({ timestamp: new Date("2026-07-23T14:10:00.000Z"), rainMm: 1.5 }),
        row({ timestamp: new Date("2026-07-23T14:40:00.000Z"), rainMm: 2.5 }),
      ]);

      const buckets = await repository.aggregate(
        "main",
        "rain_mm",
        new Date("2026-07-23T00:00:00.000Z"),
        "hour",
      );

      expect(buckets).toEqual([
        { bucket: new Date("2026-07-23T14:00:00.000Z"), avg: 2, min: 1.5, max: 2.5, sum: 4 },
      ]);
    });

    it("retorna [] quando não há leituras no período (READ-08)", async () => {
      await repository.insertIgnoreConflicts([
        row({ timestamp: new Date("2026-01-01T00:00:00.000Z"), temperatureC: 10 }),
      ]);

      const buckets = await repository.aggregate(
        "main",
        "temperature_c",
        new Date("2026-07-23T00:00:00.000Z"),
        "hour",
      );

      expect(buckets).toEqual([]);
    });

    it("não mistura dados de outra estação (READ-01)", async () => {
      await repository.ensureStation("other");
      await repository.insertIgnoreConflicts([
        row({
          stationId: "other",
          timestamp: new Date("2026-07-23T14:10:00.000Z"),
          temperatureC: 99,
        }),
        row({ timestamp: new Date("2026-07-23T14:20:00.000Z"), temperatureC: 20 }),
      ]);

      const buckets = await repository.aggregate(
        "main",
        "temperature_c",
        new Date("2026-07-23T00:00:00.000Z"),
        "hour",
      );

      expect(buckets).toEqual([
        { bucket: new Date("2026-07-23T14:00:00.000Z"), avg: 20, min: 20, max: 20, sum: null },
      ]);
    });

    it("bucket com leitura mas sem valor para a métrica pedida → avg/min/max/sum null (sensor falhou)", async () => {
      await repository.insertIgnoreConflicts([
        row({
          timestamp: new Date("2026-07-23T14:10:00.000Z"),
          temperatureC: 20,
          rainMm: null,
        }),
      ]);

      const buckets = await repository.aggregate(
        "main",
        "rain_mm",
        new Date("2026-07-23T00:00:00.000Z"),
        "hour",
      );

      expect(buckets).toEqual([
        {
          bucket: new Date("2026-07-23T14:00:00.000Z"),
          avg: null,
          min: null,
          max: null,
          sum: null,
        },
      ]);
    });
  });
});
