import { fileURLToPath } from "node:url";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, type Database } from "./client.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Pasta com os arquivos SQL de migration gerados por `drizzle-kit generate`.
 * Resolvida relativa a este arquivo (funciona igual em `src/db` — dev/test
 * via tsx/vitest — e em `dist/db` — build), subindo até a raiz do
 * monorepo (`api/../`) e entrando em `db/migrations`.
 *
 * Em container, `db/migrations` (raiz do repo) é montado/copiado para `/db`
 * (ver docker-compose.yml e api/Dockerfile), de forma que a mesma
 * resolução relativa (`../../../db/migrations` a partir de `/app/src|dist/db`)
 * também aponta corretamente para `/db/migrations`.
 */
export const migrationsFolder = path.resolve(currentDir, "../../../db/migrations");

/** Aplica as migrations pendentes. Idempotente — Drizzle rastreia o que já rodou. */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder });
}

async function main(): Promise<void> {
  const { db, pool } = getDb();

  try {
    await runMigrations(db);
    // eslint-disable-next-line no-console
    console.log(`[db:migrate] migrations aplicadas (${migrationsFolder}).`);
  } finally {
    await closeDb(pool);
  }
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[db:migrate] falhou:", error);
    process.exit(1);
  });
}
