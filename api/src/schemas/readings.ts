import { z } from "zod";
import { readings } from "../db/schema.js";
import { checkDateRange } from "./history.js";

/** Métricas expostas por `GET /readings/series` (READ-07 — whitelist). */
export const metricSchema = z.enum([
  "temperature_c",
  "humidity_pct",
  "pressure_hpa",
  "rain_mm",
  "uv_index",
]);

/** Períodos pré-definidos aceitos na query da série agregada (design.md — bucketing). */
export const rangeSchema = z.enum(["24h", "7d", "30d"]);

export type Metric = z.infer<typeof metricSchema>;
export type Range = z.infer<typeof rangeSchema>;

/**
 * Janela de uma série: um período pré-definido (`range`, relativo a "agora")
 * OU um intervalo explícito (`from`/`to`, seletor "Personalizado" do painel —
 * pedido do usuário, 2026-11-24).
 */
export type SeriesWindow = { range: Range } | { from: Date; to: Date };

/**
 * Contrato de query de `GET /api/v1/readings/series`: `metric` + (`range` OU
 * `from`+`to`). Os dois modos são exclusivos. `from`/`to` seguem a MESMA
 * validação do histórico (`checkDateRange`: `from ≤ to`, no máximo
 * `MAX_RANGE_DAYS` dias).
 */
export const seriesQuerySchema = z
  .object({
    metric: metricSchema,
    range: rangeSchema.optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    const hasRange = value.range !== undefined;
    const hasFrom = value.from !== undefined;
    const hasTo = value.to !== undefined;

    if (hasRange && (hasFrom || hasTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["range"],
        message: "use 'range' OU 'from'/'to', não os dois",
      });
      return;
    }

    if (!hasRange && !(hasFrom && hasTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasFrom || hasTo ? [hasFrom ? "to" : "from"] : ["range"],
        message: "informe 'range' ou o par 'from'/'to'",
      });
      return;
    }

    checkDateRange(value, ctx);
  })
  .transform((value): { metric: Metric; window: SeriesWindow } => ({
    metric: value.metric,
    window:
      value.range !== undefined
        ? { range: value.range }
        : { from: new Date(value.from as string), to: new Date(value.to as string) },
  }));

export type SeriesQuery = z.infer<typeof seriesQuerySchema>;

/**
 * Whitelist `metric → coluna Drizzle` (design.md — "Segurança"). `metric`
 * nunca é interpolada em SQL cru: só serve para indexar este mapa, cujo
 * valor é uma coluna Drizzle tipada.
 */
export const METRIC_COLUMNS = {
  temperature_c: readings.temperatureC,
  humidity_pct: readings.humidityPct,
  pressure_hpa: readings.pressureHpa,
  rain_mm: readings.rainMm,
  uv_index: readings.uvIndex,
} as const satisfies Record<Metric, unknown>;
