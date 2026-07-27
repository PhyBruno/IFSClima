import type { FastifyInstance } from "fastify";
import { exportQuerySchema, historyQuerySchema } from "../schemas/history.js";
import { InvalidRangeError, type HistoryService } from "../services/history-service.js";

/**
 * `InvalidRangeError` (services/history-service.ts) só é lançado depois que
 * `resolveRange` já aplicou os defaults de `from`/`to` — cobre os casos que
 * o Zod (`historyQuerySchema`/`exportQuerySchema`) não alcança porque só
 * valida quando AMBOS os campos vêm na query (achados F8). Mapeado para o
 * mesmo formato `{error, issues}` dos demais 400s da rota.
 */
function invalidRangeErrorResponse(error: InvalidRangeError) {
  return {
    error: "invalid query",
    issues: [{ path: error.path, message: error.message }],
  };
}

export interface HistoryRouteOptions {
  historyService: HistoryService;
  /** Estação única do v1 (D3) — mesmo padrão de `readingsRoute` (F4). */
  stationId: string;
}

/**
 * Rotas públicas de histórico/export (F8 — sem auth, D2). Só HTTP: valida
 * query, delega a `HistoryService`, define `Cache-Control: no-store` (mesmo
 * padrão de `routes/readings.ts` — dataset pequeno, sem cache no v1).
 */
export async function historyRoute(
  app: FastifyInstance,
  options: HistoryRouteOptions,
): Promise<void> {
  const { historyService, stationId } = options;

  app.get("/api/v1/readings", async (request, reply) => {
    const parsed = historyQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid query",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    try {
      const result = await historyService.list({
        stationId,
        from: parsed.data.from,
        to: parsed.data.to,
        page: parsed.data.page,
        pageSize: parsed.data.page_size,
        order: parsed.data.order,
      });

      return reply.header("Cache-Control", "no-store").send(result);
    } catch (error) {
      if (error instanceof InvalidRangeError) {
        return reply.status(400).send(invalidRangeErrorResponse(error));
      }

      throw error;
    }
  });

  app.get("/api/v1/readings/export", async (request, reply) => {
    const parsed = exportQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid query",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    try {
      const { stream, contentType, filename } = historyService.exportStream({
        stationId,
        from: parsed.data.from,
        to: parsed.data.to,
        format: parsed.data.format,
      });

      return reply
        .header("Cache-Control", "no-store")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .type(contentType)
        .send(stream);
    } catch (error) {
      if (error instanceof InvalidRangeError) {
        return reply.status(400).send(invalidRangeErrorResponse(error));
      }

      throw error;
    }
  });
}
