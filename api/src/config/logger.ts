import type { FastifyServerOptions } from "fastify";

/**
 * Configuração do logger estruturado da API (T7.2 — QA-06).
 *
 * Fastify já loga, por padrão, método/rota/status/latência de cada
 * requisição (serializers `req`/`res` embutidos + `responseTime` no evento
 * "request completed") — isso cobre o requisito básico de observabilidade
 * sem nenhuma config extra. Esta função reforça a parte de **segurança**
 * do log:
 *
 * - `redact`: garante que o valor de `x-api-key`/`authorization` nunca
 *   aparece em claro no log, mesmo que um serializer customizado (como o
 *   `req` abaixo, que inclui `headers` para facilitar debug) venha a
 *   colocá-los no objeto logado. É defesa em profundidade para o segredo
 *   do endpoint de ingestão (ver `plugins/auth-api-key.ts`).
 * - `serializers.req`: inclui `headers` (útil para depurar `content-type`,
 *   `user-agent`, etc. em produção) mas **nunca** o corpo da requisição —
 *   dados de sensor não são segredo, mas evitamos log de payload por
 *   padrão (mesmo espírito do comentário de segurança em
 *   `routes/ingest.ts`: "nunca logar o corpo cru... nem o header
 *   X-API-Key").
 */
export function createLoggerOptions(): FastifyServerOptions["logger"] {
  return {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      // Node normaliza nomes de header para minúsculas em `req.headers`
      // (ver `plugins/auth-api-key.ts`), então só essas duas chaves bastam.
      paths: ["req.headers['x-api-key']", "req.headers.authorization"],
      censor: "[REDACTED]",
    },
    serializers: {
      req(request: { method: string; url: string; headers: Record<string, unknown> }) {
        return {
          method: request.method,
          url: request.url,
          headers: request.headers,
        };
      },
    },
  };
}
