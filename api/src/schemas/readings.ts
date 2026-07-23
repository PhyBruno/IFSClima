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

/** Resposta de `GET /api/v1/readings/latest` (READ-01..04). */
export const latestResponseSchema = z.object({
  station_id: z.string(),
  timestamp: z.string().datetime({ offset: true }).nullable(),
  age_seconds: z.number().nullable(),
  temperature_c: z.number().nullable(),
  humidity_pct: z.number().nullable(),
  pressure_hpa: z.number().nullable(),
  rain_mm: z.number().nullable(),
  uv_index: z.number().nullable(),
});

export type LatestResponse = z.infer<typeof latestResponseSchema>;

/** Um bucket agregado de `GET /api/v1/readings/series` (READ-05, READ-10). */
export const seriesBucketSchema = z.object({
  t: z.string().datetime({ offset: true }),
  avg: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  sum: z.number().nullable().optional(),
});

/** Resposta de `GET /api/v1/readings/series` (READ-05..09). */
export const seriesResponseSchema = z.object({
  metric: metricSchema,
  range: rangeSchema,
  bucket: z.enum(["hour", "day"]),
  buckets: z.array(seriesBucketSchema),
});

export type SeriesResponse = z.infer<typeof seriesResponseSchema>;
