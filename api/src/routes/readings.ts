import type { FastifyInstance } from "fastify";
import { seriesQuerySchema } from "../schemas/readings.js";
import type { ReadingsService } from "../services/readings-service.js";

export interface ReadingsRouteOptions {
  readingsService: ReadingsService;
  /** Estação única do v1 (D3) — rotas de leitura não expõem seletor de estação. */
  stationId: string;
}

/**
 * Rotas públicas de leitura do dashboard (F4 — sem auth, D2). Só HTTP: valida
 * query, delega a `ReadingsService`, define `Cache-Control: no-store`
 * (design.md — sem cache no v1, dataset pequeno, dashboard faz polling).
 */
export async function readingsRoute(
  app: FastifyInstance,
  options: ReadingsRouteOptions,
): Promise<void> {
  const { readingsService, stationId } = options;

  app.get("/api/v1/readings/latest", async (_request, reply) => {
    const result = await readingsService.getLatest(stationId);

    return reply.header("Cache-Control", "no-store").send(result);
  });

  app.get("/api/v1/readings/series", async (request, reply) => {
    const parsed = seriesQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid query",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await readingsService.getSeries(
      stationId,
      parsed.data.metric,
      parsed.data.range,
    );

    return reply.header("Cache-Control", "no-store").send(result);
  });
}
