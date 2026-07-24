import type { FastifyInstance } from "fastify";
import { exportQuerySchema, historyQuerySchema } from "../schemas/history.js";
import type { HistoryService } from "../services/history-service.js";

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

    const result = await historyService.list({
      stationId,
      from: parsed.data.from,
      to: parsed.data.to,
      page: parsed.data.page,
      pageSize: parsed.data.page_size,
      order: parsed.data.order,
    });

    return reply.header("Cache-Control", "no-store").send(result);
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
  });
}
