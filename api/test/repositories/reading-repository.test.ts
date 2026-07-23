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
});
