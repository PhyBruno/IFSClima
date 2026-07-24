/**
 * Cliente HTTP tipado das rotas de leitura F4 (F6 T6.1 — design.md
 * "Arquitetura frontend": `api-client.ts` + React Query).
 *
 * Tipos espelham exatamente `LatestReadingResult`/`SeriesResult` de
 * `api/src/services/readings-service.ts` (não há pacote compartilhado entre
 * `api/` e `web/` — cada um instala suas próprias dependências, ver
 * `package.json` da raiz — por isso os tipos são redeclarados aqui, não
 * importados).
 */

/** Whitelist de métricas de `GET /readings/series` (espelha `api/src/schemas/readings.ts`). */
export type Metric = "temperature_c" | "humidity_pct" | "pressure_hpa" | "rain_mm" | "uv_index";

/** Períodos suportados pela série agregada. */
export type Range = "24h" | "7d" | "30d";

/** Granularidade do bucket retornado pelo servidor (derivada de `range`). */
export type BucketUnit = "hour" | "day";

/** Payload de `GET /api/v1/readings/latest`. */
export interface LatestReading {
  station_id: string;
  timestamp: string | null;
  age_seconds: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  rain_mm: number | null;
  uv_index: number | null;
}

/** Um bucket agregado de `GET /api/v1/readings/series`. `sum` só é preenchido para `rain_mm` (UI-07). */
export interface SeriesBucket {
  t: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  sum: number | null;
}

/** Payload de `GET /api/v1/readings/series`. */
export interface SeriesResponse {
  metric: Metric;
  range: Range;
  bucket: BucketUnit;
  buckets: SeriesBucket[];
}

/** Base configurável via `VITE_API_BASE_URL` (vazio = same-origin/relativo). */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

/** Erro tipado de resposta HTTP não-OK — permite ao chamador distinguir de erros de rede/parse. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new ApiError(response.status, `Falha ao chamar ${path}: HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

/** `GET /api/v1/readings/latest` — leitura atual dos 5 sensores (UI-01..UI-04). */
export function getLatest(): Promise<LatestReading> {
  return request<LatestReading>("/api/v1/readings/latest");
}

/** `GET /api/v1/readings/series?metric=&range=` — histórico agregado (UI-05..UI-07). */
export function getSeries(metric: Metric, range: Range): Promise<SeriesResponse> {
  const query = new URLSearchParams({ metric, range });

  return request<SeriesResponse>(`/api/v1/readings/series?${query.toString()}`);
}
