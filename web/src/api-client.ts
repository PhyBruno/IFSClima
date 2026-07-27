/**
 * Cliente HTTP tipado das rotas de leitura F4/F8 (F6 T6.1 — design.md
 * "Arquitetura frontend": `api-client.ts` + React Query).
 *
 * Tipos espelham exatamente `LatestReadingResult`/`SeriesResult` de
 * `api/src/services/readings-service.ts` e `ListResult`/`HistoryReadingResult`
 * de `api/src/services/history-service.ts` (não há pacote compartilhado entre
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

/** Ordenação suportada por `GET /api/v1/readings` (espelha `Order` de `api/src/schemas/history.ts`). */
export type HistoryOrder = "asc" | "desc";

/** Formatos de exportação suportados por `GET /api/v1/readings/export` (espelha `ExportFormat`). */
export type ExportFormat = "csv" | "xlsx";

/** Uma leitura bruta de `GET /api/v1/readings` (espelha `HistoryReadingResult` de `api/src/services/history-service.ts`). */
export interface HistoryReading {
  timestamp: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  rain_mm: number | null;
  uv_index: number | null;
}

/** Payload de `GET /api/v1/readings` (espelha `ListResult`). */
export interface HistoryResponse {
  from: string;
  to: string;
  page: number;
  page_size: number;
  total: number;
  readings: HistoryReading[];
}

/** Parâmetros de `getHistory` — todos opcionais (mesmos defaults do backend: sem `from`/`to` = últimas 24h, `page=1`, `pageSize=50`, `order=desc`). */
export interface HistoryParams {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  order?: HistoryOrder;
}

/** Parâmetros de `buildExportUrl` — `format` é obrigatório (o backend tem default `csv`, mas aqui o chamador decide explicitamente qual botão foi clicado). */
export interface ExportParams {
  from?: string;
  to?: string;
  format: ExportFormat;
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

/**
 * Monta a query string comum a `getHistory`/`buildExportUrl` — só inclui
 * parâmetros efetivamente informados (undefined não vira `"from=undefined"`
 * na URL; o backend já sabe aplicar seus próprios defaults quando o
 * parâmetro está simplesmente ausente, ver `api/src/schemas/history.ts`).
 */
function buildHistoryQueryParams(params: {
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
  order?: HistoryOrder;
  format?: ExportFormat;
}): URLSearchParams {
  const query = new URLSearchParams();

  if (params.from !== undefined) query.set("from", params.from);
  if (params.to !== undefined) query.set("to", params.to);
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.page_size !== undefined) query.set("page_size", String(params.page_size));
  if (params.order !== undefined) query.set("order", params.order);
  if (params.format !== undefined) query.set("format", params.format);

  return query;
}

/** `GET /api/v1/readings?from&to&page&page_size&order` — listagem paginada de leituras brutas (HIST-01, HIST-02, HIST-05). */
export function getHistory(params: HistoryParams = {}): Promise<HistoryResponse> {
  const query = buildHistoryQueryParams({
    from: params.from,
    to: params.to,
    page: params.page,
    page_size: params.pageSize,
    order: params.order,
  });

  const search = query.toString();
  return request<HistoryResponse>(`/api/v1/readings${search ? `?${search}` : ""}`);
}

/**
 * URL de `GET /api/v1/readings/export?from&to&format=` — não é JSON (stream
 * de arquivo, `Content-Disposition: attachment`), então não passa por
 * `request<T>`: o componente usa a URL retornada num `<a href=... download>`
 * simples, deixando o browser respeitar o header do servidor (HIST-06,
 * HIST-07).
 */
export function buildExportUrl(params: ExportParams): string {
  const query = buildHistoryQueryParams({
    from: params.from,
    to: params.to,
    format: params.format,
  });

  return `${API_BASE_URL}/api/v1/readings/export?${query.toString()}`;
}
