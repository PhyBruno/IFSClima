import { z } from "zod";

const envSchema = z.object({
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
    .min(1, "INGEST_API_KEY é obrigatória (segredo do endpoint de ingestão, ex.: whs_test_ABC123)"),
  // F3: teto de leituras por lote em POST /api/v1/ingest (ING-08). Acima
  // disso a rota responde 413. Nunca excede o teto estrutural do Zod
  // (MAX_BATCH em src/schemas/ingest.ts).
  MAX_BATCH: z.coerce.number().int().positive().default(5000),
});

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
