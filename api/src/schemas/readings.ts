import { z } from "zod";
import { readings } from "../db/schema.js";

/** Métricas expostas por `GET /readings/series` (READ-07 — whitelist). */
export const metricSchema = z.enum([
  "temperature_c",
  "humidity_pct",
  "pressure_hpa",
  "rain_mm",
  "uv_index",
]);

/** Períodos suportados pela série agregada (design.md — bucketing). */
export const rangeSchema = z.enum(["24h", "7d", "30d"]);

export type Metric = z.infer<typeof metricSchema>;
export type Range = z.infer<typeof rangeSchema>;

/** Contrato de query de `GET /api/v1/readings/series`. */
export const seriesQuerySchema = z.object({
  metric: metricSchema,
  range: rangeSchema,
});

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
