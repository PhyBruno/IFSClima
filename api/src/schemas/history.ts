import { z } from "zod";

/** Tamanho de página default/máximo de `GET /api/v1/readings` (HIST-02). */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

/** Intervalo máximo permitido entre `from` e `to` (design.md — evita export gigante acidental). */
export const MAX_RANGE_DAYS = 366;
const MAX_RANGE_MS = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;

/** Ordenação temporal suportada pela listagem/export (HIST-01, HIST-02). */
export const orderSchema = z.enum(["asc", "desc"]);
export type Order = z.infer<typeof orderSchema>;

/** Formatos de exportação suportados (HIST-06, HIST-07). */
export const exportFormatSchema = z.enum(["csv", "xlsx"]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

/**
 * Valida `from ≤ to` e intervalo máximo de `MAX_RANGE_DAYS` dias — só quando
 * AMBOS estão presentes (HIST-10). Quando um dos dois (ou ambos) está
 * ausente, o default de "últimas 24h" é aplicado depois, no service
 * (`HistoryService`, T8.4) — trivialmente dentro do limite.
 *
 * Aplicada via `.superRefine()` diretamente em cada schema (em vez de um
 * wrapper genérico sobre `ZodType<T>`): um wrapper genérico colapsaria os
 * tipos de Input/Output distintos de cada campo com `.default(...)`,
 * alargando os campos default para `T | undefined` no tipo inferido.
 */
function checkDateRange(value: { from?: string; to?: string }, ctx: z.RefinementCtx): void {
  if (value.from === undefined || value.to === undefined) {
    return;
  }

  const fromMs = new Date(value.from).getTime();
  const toMs = new Date(value.to).getTime();

  if (fromMs > toMs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: "'to' deve ser maior ou igual a 'from'",
    });
    return;
  }

  if (toMs - fromMs > MAX_RANGE_MS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: `intervalo entre 'from' e 'to' não pode exceder ${MAX_RANGE_DAYS} dias`,
    });
  }
}

/** Contrato de query de `GET /api/v1/readings` (HIST-01, HIST-02, HIST-05, HIST-10). */
export const historyQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    order: orderSchema.default("desc"),
  })
  .superRefine(checkDateRange);

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

/** Contrato de query de `GET /api/v1/readings/export` (HIST-06, HIST-07, HIST-10). */
export const exportQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    format: exportFormatSchema.default("csv"),
  })
  .superRefine(checkDateRange);

export type ExportQuery = z.infer<typeof exportQuerySchema>;
