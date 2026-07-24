import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";

export interface HealthRouteOptions {
  /**
   * T7.2 (QA-09): checagem de conectividade com o banco. Injetável em
   * testes (fake sempre saudável, ou que sempre rejeita para simular banco
   * caído) — default resolve `getDb()` de forma preguiçosa (só quando o
   * handler roda), preservando `buildApp()` "testável sem porta/DB" (F1)
   * mesmo quando nenhuma option é passada (ex.: `test/app.test.ts`, que
   * nunca chama `GET /health`).
   */
  checkDb?: () => Promise<void>;
}

/** `SELECT 1` real via `getDb()` — usado quando nenhum `checkDb` é injetado. */
async function defaultCheckDb(): Promise<void> {
  const { db } = getDb();
  await db.execute(sql`select 1`);
}

/**
 * Rota `GET /health` (T7.2 — QA-09, edge case "WHEN o db cai THEN /health
 * retorna unhealthy; api não crasha em loop"). Nunca deixa a exceção
 * escapar do handler — qualquer falha na checagem de conectividade vira um
 * `503 { status: "unhealthy" }`, sem derrubar o processo.
 */
export async function healthRoute(
  app: FastifyInstance,
  options: HealthRouteOptions = {},
): Promise<void> {
  const checkDb = options.checkDb ?? defaultCheckDb;

  app.get("/health", async (request, reply) => {
    try {
      await checkDb();
      return { status: "ok" };
    } catch (err) {
      // Log só a mensagem (nunca a DATABASE_URL nem o erro bruto do driver,
      // que pode ecoar parte da connection string em alguns drivers).
      request.log.warn(
        { reason: err instanceof Error ? err.message : "unknown" },
        "health check: banco indisponível",
      );
      return reply.status(503).send({ status: "unhealthy" });
    }
  });
}
