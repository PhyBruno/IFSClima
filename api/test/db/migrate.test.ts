import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrate.js";
import { MAIN_STATION_ID, MAIN_STATION_NAME, seedMainStation } from "../../src/db/seed.js";
import { stations } from "../../src/db/schema.js";
import { startTestPostgres, type TestPostgres } from "./helpers/testPostgres.js";

describe("migrations + seed (T2.3)", () => {
  let testPg: TestPostgres;

  beforeAll(async () => {
    testPg = await startTestPostgres();
  }, 60000);

  afterAll(async () => {
    await testPg.stop();
  }, 30000);

  it("DB-06: aplica a migration inicial em um banco limpo (cria stations e readings)", async () => {
    await runMigrations(testPg.db);

    const result = await testPg.db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('stations', 'readings')
      order by table_name
    `);

    expect(result.rows.map((row) => (row as { table_name: string }).table_name)).toEqual([
      "readings",
      "stations",
    ]);
  });

  it("DB-06: re-aplicar a migration é idempotente (não lança erro)", async () => {
    await expect(runMigrations(testPg.db)).resolves.toBeUndefined();
  });

  it("DB-04: seed cria a estação `main` na primeira execução", async () => {
    await seedMainStation(testPg.db);

    const rows = await testPg.db.select().from(stations).where(eq(stations.id, MAIN_STATION_ID));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe(MAIN_STATION_NAME);
  });

  it("DB-04: seed é idempotente — reexecutar garante/atualiza sem duplicar", async () => {
    await seedMainStation(testPg.db);
    await seedMainStation(testPg.db);

    const rows = await testPg.db.select().from(stations).where(eq(stations.id, MAIN_STATION_ID));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe(MAIN_STATION_NAME);
  });
});
