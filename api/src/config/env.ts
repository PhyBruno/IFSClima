import { z } from "zod";

// F7/T7.2 (QA-07): limites de rate limiting para POST /api/v1/ingest.
// Schema separado (não exige DATABASE_URL/INGEST_API_KEY) porque `app.ts`
// precisa desses valores no *registro* do plugin `@fastify/rate-limit`
// (não pode ser resolvido preguiçosamente por requisição como
// `getIngestApiKey`/`getMaxBatch`) — ver `parseRateLimitEnv()` abaixo, usada
// por `buildApp()` mesmo quando `parseEnv()` completo ainda não pode rodar
// (testes sem env configurada).
const rateLimitEnvSchema = z.object({
  // Default 100 req/min: generoso o bastante para o polling normal do
  // dashboard (F4, a cada 60s) e para uma estação enviando lotes a cada
  // poucos segundos, mas barra flood/abuso no endpoint mais sensível
  // (ingestão recebe lotes, é o alvo natural de abuso — spec F7 P2).
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  // Default 60s (1 min) — janela alinhada ao RATE_LIMIT_MAX acima.
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export type RateLimitEnv = z.infer<typeof rateLimitEnvSchema>;

/**
 * Valida (com defaults sensatos) só as variáveis de rate limit — nunca
 * lança por falta de `DATABASE_URL`/`INGEST_API_KEY` (diferente de
 * `parseEnv()`), pois `buildApp()` precisa desses valores mesmo em testes
 * que não configuram o restante do env (ex.: `test/app.test.ts`).
 */
export function parseRateLimitEnv(source: Record<string, string | undefined> = process.env): RateLimitEnv {
  const result = rateLimitEnvSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Configuração de rate limit inválida:\n${issues}`);
  }

  return result.data;
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z
      .string({
        required_error: "DATABASE_URL é obrigatória (ex.: postgres://user:pass@host:5432/db)",
      })
      .min(1, "DATABASE_URL é obrigatória (ex.: postgres://user:pass@host:5432/db)"),
    // F3: chave de autenticação do endpoint de ingestão (POST /api/v1/ingest),
    // nome alinhado ao contrato de design.md/spec.md.
    INGEST_API_KEY: z
      .string({
        required_error:
          "INGEST_API_KEY é obrigatória (segredo do endpoint de ingestão, ex.: whs_test_ABC123)",
      })
      .min(
        1,
        "INGEST_API_KEY é obrigatória (segredo do endpoint de ingestão, ex.: whs_test_ABC123)",
      ),
    // F3: teto de leituras por lote em POST /api/v1/ingest (ING-08). Acima
    // disso a rota responde 413. Nunca excede o teto estrutural do Zod
    // (MAX_BATCH em src/schemas/ingest.ts).
    MAX_BATCH: z.coerce.number().int().positive().default(5000),
  })
  .merge(rateLimitEnvSchema);

export type Env = z.infer<typeof envSchema>;

/**
 * Valida e converte as variáveis de ambiente com Zod.
 * Lança um Error com mensagem clara (campo + motivo) quando algo obrigatório falta ou é inválido.
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }

  return result.data;
}
