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
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    options: "-c timezone=UTC",
    // Code review F7 (achado 2): sem timeout, um Postgres "blackhole"
    // (pausado, partição de rede — TCP nunca erra) deixa `GET /health`
    // (e qualquer outra rota) pendurada pra sempre, e cada tentativa nova
    // some com mais uma conexão do pool até esgotá-lo (`max: 10` default),
    // travando também `/ingest`/`/readings/*`. 5s é folgado o bastante pra
    // não gerar falso-positivo num Postgres saudável (mesmo sob alguma
    // lentidão pontual), mas curto o bastante pra `/health` responder 503
    // "rápido" (poucos segundos, não minutos/nunca).
    connectionTimeoutMillis: 5000,
    // Enviado como startup parameter (equivalente a `SET statement_timeout`
    // na sessão, mesmo mecanismo do `-c timezone=UTC` acima) — cancelado
    // pelo próprio servidor Postgres após 5s, independente do estado da
    // conexão de rede com o client.
    statement_timeout: 5000,
  });

  // Code review F7 (achado 1): o `pg-pool` emite `pool.emit('error', err,
  // client)` quando detecta um client OCIOSO que perdeu a conexão (Postgres
  // reiniciado, failover, OOM). Sem um listener aqui, isso vira uma
  // `uncaughtException` e derruba o processo Node inteiro — em produção
  // (`restart: unless-stopped`) isso pode virar loop de restart se o `db`
  // ainda não tiver voltado (migrations falham no boot → `process.exit(1)`).
  // Só logamos: o pool descarta o client ocioso sozinho e continua servindo
  // as próximas conexões.
  pool.on("error", (err) => {
    console.error("[db] erro em client ocioso do pool pg:", err.message);
  });

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
