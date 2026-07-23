import type { FastifyInstance } from "fastify";
import { createApiKeyAuthPreHandler } from "../plugins/auth-api-key.js";
import { ingestRequestSchema } from "../schemas/ingest.js";
import type { IngestService } from "../services/ingest-service.js";

export interface IngestRouteOptions {
  ingestService: IngestService;
  /** Resolvida por requisição (não no registro) — ver `app.ts`. */
  getIngestApiKey: () => string;
  /** Resolvida por requisição — permite refletir MAX_BATCH do env em runtime. */
  getMaxBatch: () => number;
}

/** Limite de tamanho de corpo HTTP (bytes) — mitigação de payload gigante (tasks.md T3.5). */
export const INGEST_BODY_LIMIT_BYTES = 10 * 1024 * 1024; // 10MB

function hasOversizedReadingsArray(body: unknown, maxBatch: number): boolean {
  if (body === null || typeof body !== "object") {
    return false;
  }

  const readings = (body as { readings?: unknown }).readings;

  return Array.isArray(readings) && readings.length > maxBatch;
}

/**
 * Rota `POST /api/v1/ingest` (F3 — coração do sistema). Só HTTP: auth,
 * parse/validação estrutural, mapeamento de resultado → status. Nenhuma
 * regra de negócio aqui — tudo delegado a `IngestService` (T3.3).
 *
 * IMPORTANTE (segurança): nunca logar o corpo cru da requisição (pode
 * conter dados de sensor, mas não segredos — ainda assim, evitamos log de
 * payload por padrão) nem o header `X-API-Key` (ver `plugins/auth-api-key.ts`).
 */
export async function ingestRoute(
  app: FastifyInstance,
  options: IngestRouteOptions,
): Promise<void> {
  const { ingestService, getIngestApiKey, getMaxBatch } = options;

  app.post(
    "/api/v1/ingest",
    {
      bodyLimit: INGEST_BODY_LIMIT_BYTES,
      preHandler: createApiKeyAuthPreHandler(getIngestApiKey),
    },
    async (request, reply) => {
      const maxBatch = getMaxBatch();

      // 413 antes da validação estrutural: teto de itens por lote (ING-08).
      // Checado antes do Zod para não confundir "lote grande demais" (413)
      // com "estrutura inválida" (400) — ver design.md.
      if (hasOversizedReadingsArray(request.body, maxBatch)) {
        return reply.status(413).send({
          error: "batch too large",
          maxBatch,
        });
      }

      const parsed = ingestRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid request body",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const result = await ingestService.ingest(parsed.data);

      return reply.status(202).send(result);
    },
  );
}
