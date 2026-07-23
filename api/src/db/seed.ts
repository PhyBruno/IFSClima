import { fileURLToPath } from "node:url";
import path from "node:path";
import { closeDb, getDb, type Database } from "./client.js";
import { stations } from "./schema.js";

export const MAIN_STATION_ID = "main";
export const MAIN_STATION_NAME = "Estação Principal";

/**
 * Garante a existência da estação `main` (D3: estação única no v1, mas
 * `station_id` já é uma FK real preparada para expansão futura).
 * Idempotente: insere na primeira vez, atualiza o nome nas seguintes
 * (upsert via ON CONFLICT), sem duplicar nem falhar em re-execução.
 */
export async function seedMainStation(db: Database): Promise<void> {
  await db
    .insert(stations)
    .values({ id: MAIN_STATION_ID, name: MAIN_STATION_NAME })
    .onConflictDoUpdate({
      target: stations.id,
      set: { name: MAIN_STATION_NAME },
    });
}

async function main(): Promise<void> {
  const { db, pool } = getDb();

  try {
    await seedMainStation(db);
    // eslint-disable-next-line no-console
    console.log(`[db:seed] estação "${MAIN_STATION_ID}" garantida.`);
  } finally {
    await closeDb(pool);
  }
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[db:seed] falhou:", error);
    process.exit(1);
  });
}
