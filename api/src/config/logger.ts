import type { FastifyServerOptions } from "fastify";
import { parseLoggerEnv } from "./env.js";

/**
 * Headers considerados seguros para aparecer em claro no log (allowlist).
 *
 * Estrutural: qualquer header que não estiver nesta lista simplesmente não
 * é copiado para o objeto logado — diferente de uma denylist, um header
 * sensível novo (`cookie`, `proxy-authorization`, `x-auth-token`,
 * `set-cookie`, etc.) nunca vaza por omissão de atualização desta lista.
 * Node normaliza nomes de header para minúsculas em `request.headers`
 * (ver `plugins/auth-api-key.ts`), então as chaves abaixo já são as chaves
 * reais do objeto.
 */
const LOGGABLE_HEADERS = ["content-type", "user-agent", "content-length", "accept"] as const;

/** Requisição real que o Fastify passa ao serializer `req` (verificado empiricamente — não é só `{method, url, headers}`). */
interface LoggableRequest {
  method: string;
  url: string;
  hostname?: string;
  ip?: string;
  socket?: { remotePort?: number };
  headers: Record<string, unknown>;
}

function pickLoggableHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};

  for (const name of LOGGABLE_HEADERS) {
    if (headers[name] !== undefined) {
      picked[name] = headers[name];
    }
  }

  return picked;
}

/**
 * Configuração do logger estruturado da API (T7.2 — QA-06).
 *
 * Fastify já loga, por padrão, método/rota/status/latência de cada
 * requisição (serializers `req`/`res` embutidos + `responseTime` no evento
 * "request completed") — isso cobre o requisito básico de observabilidade
 * sem nenhuma config extra. Esta função reforça a parte de **segurança**
 * do log:
 *
 * - `serializers.req`: inclui só os headers de uma **allowlist**
 *   (`content-type`, `user-agent`, `content-length`, `accept` — úteis para
 *   depurar em produção) em vez de todos os headers da requisição. Qualquer
 *   header fora da allowlist (segredos como `x-api-key`/`authorization`, ou
 *   um futuro `cookie` de sessão se um reverse proxy vier a fazer auth via
 *   cookie na frente da api — ver README F7 T7.4) nunca é copiado para o
 *   objeto logado. Também restaura `hostname`/`remoteAddress`/`remotePort`
 *   do serializer default do Fastify (usa `request.hostname`/`request.ip`/
 *   `request.socket.remotePort` — confirmado empiricamente, ver
 *   `test/config/logger.test.ts`), perdidos quando o serializer customizado
 *   só devolvia `{method, url, headers}`: é o dado necessário para
 *   investigar abuso (motivo de existir rate limiting, QA-07).
 * - `redact`: mantido como defesa em profundidade além da allowlist acima
 *   (não é mais a única barreira) — garante que, mesmo que outro código
 *   passe `x-api-key`/`authorization` para dentro de um objeto `req`
 *   logado por algum caminho não previsto, o valor nunca aparece em claro.
 * - Nunca inclui o corpo da requisição — dados de sensor não são segredo,
 *   mas evitamos log de payload por padrão (mesmo espírito do comentário de
 *   segurança em `routes/ingest.ts`: "nunca logar o corpo cru... nem o
 *   header X-API-Key").
 * - `level`: lido via `parseLoggerEnv()` (Zod, ver `config/env.ts`), nunca
 *   direto de `process.env.LOG_LEVEL` — um valor inválido (ex.
 *   `LOG_LEVEL=verbose`, que não existe no pino) lança um erro claro em vez
 *   de deixar `pino({level: "verbose"})` explodir sem tratamento dentro de
 *   `buildApp()` (fora dos `try/catch` de `server.ts`).
 */
export function createLoggerOptions(): FastifyServerOptions["logger"] {
  return {
    level: parseLoggerEnv().LOG_LEVEL,
    redact: {
      paths: ["req.headers['x-api-key']", "req.headers.authorization"],
      censor: "[REDACTED]",
    },
    serializers: {
      req(request: LoggableRequest) {
        return {
          method: request.method,
          url: request.url,
          hostname: request.hostname,
          remoteAddress: request.ip,
          remotePort: request.socket?.remotePort,
          headers: pickLoggableHeaders(request.headers),
        };
      },
    },
  };
}
