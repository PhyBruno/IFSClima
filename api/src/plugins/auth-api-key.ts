import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const API_KEY_HEADER = "x-api-key";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Compara duas strings em tempo constante (ING-05), sem vazar informação
 * por diferença de tamanho: `crypto.timingSafeEqual` lança se os buffers
 * tiverem tamanhos diferentes, então hasheamos ambos primeiro (SHA-256 →
 * sempre 32 bytes) — nunca lança e nunca faz short-circuit por length.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

export type ApiKeyAuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * Cria o preHandler de autenticação `X-API-Key` (T3.4 / ING-04, ING-05).
 *
 * `getExpectedKey` é chamada por requisição (não no registro da rota),
 * permitindo resolver a chave a partir do env tardiamente sem obrigar
 * `buildApp()` a validar env no momento da montagem (mantém a app
 * testável sem env/DB configurados — mesmo espírito de `getDb()` em F2).
 *
 * Segurança: nunca loga o header recebido, a chave esperada, nem o corpo
 * da requisição — a resposta de erro é genérica (`401`, sem detalhe).
 */
export function createApiKeyAuthPreHandler(getExpectedKey: () => string): ApiKeyAuthPreHandler {
  return async (request, reply) => {
    const provided = request.headers[API_KEY_HEADER];

    if (typeof provided !== "string" || provided.length === 0) {
      await reply.status(401).send({ error: "unauthorized" });
      return;
    }

    const expected = getExpectedKey();

    if (!constantTimeEquals(provided, expected)) {
      await reply.status(401).send({ error: "unauthorized" });
      return;
    }
  };
}
