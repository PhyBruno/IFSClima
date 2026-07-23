import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrate.js";
import { readings, stations } from "../../src/db/schema.js";
import { startTestPostgres, type TestPostgres } from "./helpers/testPostgres.js";

describe("schema stations + readings (T2.2 — constraints)", () => {
  let testPg: TestPostgres;

  beforeAll(async () => {
    testPg = await startTestPostgres();
    await runMigrations(testPg.db);
    await testPg.db.insert(stations).values({ id: "main", name: "Estação Principal (synthetic)" });
  }, 90000);

  afterAll(async () => {
    await testPg.stop();
  }, 30000);

  it("DB-02: aceita leitura com todos os sensores nulos", async () => {
    const ts = new Date("2026-07-23T14:30:00.000Z");

    await expect(
      testPg.db.insert(readings).values({
        stationId: "main",
        timestamp: ts,
        temperatureC: null,
        humidityPct: null,
        pressureHpa: null,
        rainMm: null,
        uvIndex: null,
      }),
    ).resolves.not.toThrow();

    const [row] = await testPg.db
      .select()
      .from(readings)
      .where(and(eq(readings.stationId, "main"), eq(readings.timestamp, ts)));

    expect(row?.temperatureC).toBeNull();
    expect(row?.humidityPct).toBeNull();
    expect(row?.receivedAt).toBeInstanceOf(Date);
  });

  it("DB-01: rejeita insert duplicado por (station_id, timestamp)", async () => {
    const ts = new Date("2026-07-23T15:00:00.000Z");

    await testPg.db.insert(readings).values({ stationId: "main", timestamp: ts, temperatureC: 24.7 });

    await expect(
      testPg.db.insert(readings).values({ stationId: "main", timestamp: ts, temperatureC: 25.1 }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("DB-01: ON CONFLICT DO NOTHING garante idempotência de reenvio do buffer offline", async () => {
    const ts = new Date("2026-07-23T15:30:00.000Z");

    await testPg.db.insert(readings).values({ stationId: "main", timestamp: ts, temperatureC: 10 });

    await expect(
      testPg.db
        .insert(readings)
        .values({ stationId: "main", timestamp: ts, temperatureC: 99 })
        .onConflictDoNothing(),
    ).resolves.not.toThrow();

    const rows = await testPg.db
      .select()
      .from(readings)
      .where(and(eq(readings.stationId, "main"), eq(readings.timestamp, ts)));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.temperatureC).toBe(10);
  });

  it("DB-05: rejeita station_id inexistente (violação de FK)", async () => {
    await expect(
      testPg.db.insert(readings).values({
        stationId: "estacao-fantasma",
        timestamp: new Date("2026-07-23T16:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("DB-03: existe índice (station_id, timestamp DESC) para consultas temporais", async () => {
    const result = await testPg.db.execute(sql`
      select indexdef from pg_indexes
      where tablename = 'readings' and indexname = 'readings_station_id_timestamp_idx'
    `);

    expect(result.rows).toHaveLength(1);
    const indexdef = String((result.rows[0] as { indexdef: string }).indexdef);
    expect(indexdef).toMatch(/station_id/);
    expect(indexdef).toMatch(/"timestamp"\s+DESC/i);
  });
});
