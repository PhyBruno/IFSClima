import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, createDb, getDb } from "../../src/db/client.js";
import { startTestPostgres, type TestPostgres } from "./helpers/testPostgres.js";

describe("db client (T2.1 — conectividade)", () => {
  let testPg: TestPostgres;
  let getDbPool: import("pg").Pool | undefined;

  beforeAll(async () => {
    testPg = await startTestPostgres();
  }, 60000);

  afterAll(async () => {
    if (getDbPool) {
      await closeDb(getDbPool);
    }
    await testPg.stop();
  }, 30000);

  it("createDb abre uma conexão utilizável e closeDb fecha sem erro", async () => {
    const { db, pool } = createDb(testPg.databaseUrl);

    const result = await db.execute(sql`select 1 as ok`);
    expect(result.rows[0]).toEqual({ ok: 1 });

    await expect(closeDb(pool)).resolves.toBeUndefined();
  });

  it("getDb() lê DATABASE_URL do env validado (F1) e cacheia a conexão", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalApiKey = process.env.API_KEY;
    const originalIngestApiKey = process.env.INGEST_API_KEY;
    process.env.DATABASE_URL = testPg.databaseUrl;
    process.env.API_KEY = process.env.API_KEY ?? "whs_test_ABC123";
    process.env.INGEST_API_KEY = process.env.INGEST_API_KEY ?? "whs_test_ABC123";

    try {
      const first = getDb();
      const second = getDb();
      getDbPool = first.pool;

      expect(second.pool).toBe(first.pool);
      expect(second.db).toBe(first.db);

      const result = await first.db.execute(sql`select 1 as ok`);
      expect(result.rows[0]).toEqual({ ok: 1 });
    } finally {
      process.env.DATABASE_URL = originalDatabaseUrl;
      process.env.API_KEY = originalApiKey;
      process.env.INGEST_API_KEY = originalIngestApiKey;
    }
  });
});
