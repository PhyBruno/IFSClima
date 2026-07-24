import type { LatestReading, SeriesResponse } from "../../src/api-client";

/** Fixtures sintéticas (não são dados reais) — espelham o contrato F4 (design.md, exemplo de `latest`). */
export const latestFixture: LatestReading = {
  station_id: "main",
  timestamp: "2026-07-23T14:30:00.000Z",
  age_seconds: 42,
  temperature_c: 24.7,
  humidity_pct: 61.2,
  pressure_hpa: 1013.4,
  rain_mm: 0.4,
  uv_index: 5.3,
};

/** Estação sem nenhuma leitura ainda (READ-01/UI-04) — todos os campos numéricos `null`. */
export const emptyLatestFixture: LatestReading = {
  station_id: "main",
  timestamp: null,
  age_seconds: null,
  temperature_c: null,
  humidity_pct: null,
  pressure_hpa: null,
  rain_mm: null,
  uv_index: null,
};

export const seriesFixture: SeriesResponse = {
  metric: "temperature_c",
  range: "24h",
  bucket: "hour",
  buckets: [
    { t: "2026-07-23T13:00:00.000Z", avg: 24.1, min: 23.6, max: 24.8, sum: null },
    { t: "2026-07-23T14:00:00.000Z", avg: 24.7, min: 24.0, max: 25.1, sum: null },
  ],
};

/** Chuva usa `sum` (agregação acumulada — UI-07), diferente das demais métricas. */
export const rainSeriesFixture: SeriesResponse = {
  metric: "rain_mm",
  range: "24h",
  bucket: "hour",
  buckets: [
    { t: "2026-07-23T13:00:00.000Z", avg: 0.1, min: 0, max: 0.3, sum: 0.4 },
    { t: "2026-07-23T14:00:00.000Z", avg: 0.05, min: 0, max: 0.1, sum: 0.1 },
  ],
};

/** Período sem nenhum dado (UI-06/edge case: "período sem dados"). */
export const emptySeriesFixture: SeriesResponse = {
  metric: "temperature_c",
  range: "30d",
  bucket: "day",
  buckets: [],
};
