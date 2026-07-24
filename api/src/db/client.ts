import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { parseEnv } from "../config/env.js";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

/**
 * Cria um pool de conexão pg + client Drizzle a partir de uma DATABASE_URL
 * explícita. Usado pelo client "default" (env do processo) e pelos testes
 * de integração (que apontam para um Postgres efêmero via Testcontainers).
 */
export function createDb(databaseUrl: string): { db: Database; pool: pg.Pool } {
  // Força UTC na sessão independente do timezone default do servidor
  // Postgres (design.md de F4 — agregação de séries em `date_trunc` assume
  // UTC; sem isso, `date_trunc('day', ...)` mudaria de fronteira se o
  // timezone default do servidor/sessão não fosse UTC).
  const pool = new pg.Pool({ connectionString: databaseUrl, options: "-c timezone=UTC" });
  const db = drizzle(pool, { schema });

  return { db, pool };
}

let cached: { db: Database; pool: pg.Pool } | undefined;

/**
 * Client Drizzle "default", lendo DATABASE_URL do env já validado por
 * `config/env.ts` (F1). Lazy: só conecta quando efetivamente usado, para
 * não quebrar processos (ex.: testes) que não precisam de banco.
 */
export function getDb(): { db: Database; pool: pg.Pool } {
  if (!cached) {
    const env = parseEnv();
    cached = createDb(env.DATABASE_URL);
  }

  return cached;
}

export async function closeDb(pool: pg.Pool): Promise<void> {
  await pool.end();
}
