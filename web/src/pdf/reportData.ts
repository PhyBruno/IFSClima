import type { HistoryReading, Metric, SeriesResponse } from "../api-client";

/**
 * Dados e formatação dos relatórios em PDF (dashboard e histórico) — funções
 * PURAS, sem DOM, para que as contas (mín/média/máx, total de chuva,
 * paginação da tabela, redução de pontos dos gráficos) sejam testadas
 * isoladamente, sem precisar renderizar nem capturar nada.
 *
 * **Cores em hex, não os tokens `oklch()` do tema**: o relatório é sempre
 * CLARO (é pra imprimir — independe do tema ativo na tela) e os gráficos são
 * SVG serializado pelo `html2canvas-pro` como imagem, onde variáveis CSS e
 * classes do Tailwind não se aplicam. Os valores são os tons `-600` da paleta
 * Tailwind equivalentes aos `--sensor-*` de `index.css` (mesma matiz, um
 * pouco mais escuros pra ter contraste em papel branco).
 */
export interface MetricMeta {
  metric: Metric;
  label: string;
  unit: string;
  /** Casas decimais usadas no relatório. */
  digits: number;
  /** Cor de traço/destaque (hex). */
  color: string;
  /** Fundo suave do chip do ícone (hex). */
  soft: string;
}

export const REPORT_METRICS: readonly MetricMeta[] = [
  {
    metric: "temperature_c",
    label: "Temperatura",
    unit: "°C",
    digits: 1,
    color: "#ea580c",
    soft: "#fff7ed",
  },
  {
    metric: "humidity_pct",
    label: "Umidade",
    unit: "%",
    digits: 0,
    color: "#0284c7",
    soft: "#f0f9ff",
  },
  {
    metric: "pressure_hpa",
    label: "Pressão",
    unit: "hPa",
    digits: 1,
    color: "#0d9488",
    soft: "#f0fdfa",
  },
  { metric: "rain_mm", label: "Chuva", unit: "mm", digits: 1, color: "#0891b2", soft: "#ecfeff" },
  {
    metric: "uv_index",
    label: "Índice UV",
    unit: "",
    digits: 1,
    color: "#9333ea",
    soft: "#faf5ff",
  },
];

export function getMetricMeta(metric: Metric): MetricMeta {
  return REPORT_METRICS.find((meta) => meta.metric === metric)!;
}

export interface MetricSummary {
  min: number | null;
  avg: number | null;
  max: number | null;
  /** Soma dos valores — só faz sentido para chuva (acumulado do período). */
  total: number | null;
  /** Quantos valores não-nulos entraram na conta. */
  count: number;
}

const EMPTY_SUMMARY: MetricSummary = { min: null, avg: null, max: null, total: null, count: 0 };

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function summarizeValues(values: number[]): MetricSummary {
  if (values.length === 0) {
    return EMPTY_SUMMARY;
  }

  const total = values.reduce((acc, value) => acc + value, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: total / values.length,
    total,
    count: values.length,
  };
}

/**
 * Resumo de uma série agregada (`GET /readings/series`). Mín/máx vêm dos
 * `min`/`max` de cada bucket (o extremo REAL do período, não o extremo das
 * médias). A média é a média das médias dos buckets. Para chuva, o
 * `total` é a soma dos `sum` (acumulado do período) e mín/máx/média
 * descrevem o volume POR bucket (hora ou dia), não a leitura individual.
 */
export function summarizeSeries(response: SeriesResponse | undefined): MetricSummary {
  if (!response || response.buckets.length === 0) {
    return EMPTY_SUMMARY;
  }

  if (response.metric === "rain_mm") {
    return summarizeValues(response.buckets.map((bucket) => bucket.sum).filter(isNumber));
  }

  const avgs = response.buckets.map((bucket) => bucket.avg).filter(isNumber);
  if (avgs.length === 0) {
    return EMPTY_SUMMARY;
  }

  const mins = response.buckets.map((bucket) => bucket.min).filter(isNumber);
  const maxs = response.buckets.map((bucket) => bucket.max).filter(isNumber);
  const base = summarizeValues(avgs);
  return {
    ...base,
    min: mins.length > 0 ? Math.min(...mins) : base.min,
    max: maxs.length > 0 ? Math.max(...maxs) : base.max,
  };
}

/** Resumo de leituras brutas (`GET /readings`) para uma métrica — nulos ignorados. */
export function summarizeReadings(readings: HistoryReading[], metric: Metric): MetricSummary {
  return summarizeValues(readings.map((reading) => reading[metric]).filter(isNumber));
}

export interface ChartPoint {
  /** Epoch ms. */
  t: number;
  v: number | null;
}

/** Série agregada → pontos do gráfico. Chuva usa `sum` (acumulado do bucket), as demais `avg`. */
export function seriesToPoints(response: SeriesResponse | undefined): ChartPoint[] {
  if (!response) {
    return [];
  }

  const useSum = response.metric === "rain_mm";
  return response.buckets.map((bucket) => ({
    t: new Date(bucket.t).getTime(),
    v: useSum ? bucket.sum : bucket.avg,
  }));
}

/** Leituras brutas → pontos do gráfico em ordem cronológica (a API devolve `desc` por padrão). */
export function readingsToPoints(readings: HistoryReading[], metric: Metric): ChartPoint[] {
  return readings
    .map((reading) => ({ t: new Date(reading.timestamp).getTime(), v: reading[metric] }))
    .filter((point) => Number.isFinite(point.t))
    .sort((a, b) => a.t - b.t);
}

/**
 * Reduz `points` para no máximo `maxPoints`, agrupando pontos consecutivos
 * (média, ou soma para chuva). Um período longo do histórico pode ter
 * milhares de leituras, e um `<path>` com milhares de vértices numa largura
 * de ~700px não mostra nada a mais: só pesa na serialização do SVG. Grupo
 * sem nenhum valor vira `null` (buraco no traço, igual a um sensor sem
 * sinal).
 */
export function downsample(
  points: ChartPoint[],
  maxPoints: number,
  mode: "avg" | "sum" = "avg",
): ChartPoint[] {
  if (points.length <= maxPoints) {
    return points;
  }

  const groupSize = Math.ceil(points.length / maxPoints);
  const result: ChartPoint[] = [];

  for (let start = 0; start < points.length; start += groupSize) {
    const group = points.slice(start, start + groupSize);
    const values = group.map((point) => point.v).filter(isNumber);
    const sum = values.reduce((acc, value) => acc + value, 0);
    result.push({
      t: group[0]!.t,
      v: values.length === 0 ? null : mode === "sum" ? sum : sum / values.length,
    });
  }

  return result;
}

/**
 * Divide `items` em páginas: a primeira com `firstPageSize` itens e as
 * seguintes com `pageSize`. Sempre devolve ao menos UMA página (vazia se
 * não houver itens), pra que o relatório tenha onde desenhar o estado vazio.
 */
export function paginate<T>(items: T[], firstPageSize: number, pageSize: number): T[][] {
  const pages: T[][] = [items.slice(0, firstPageSize)];

  for (let start = firstPageSize; start < items.length; start += pageSize) {
    pages.push(items.slice(start, start + pageSize));
  }

  return pages;
}

const numberFormatters = new Map<number, Intl.NumberFormat>();

/** Número em pt-BR (`24,7`) com `digits` casas fixas. `null` → `"—"`. */
export function formatNumber(value: number | null | undefined, digits: number): string {
  if (!isNumber(value)) {
    return "—";
  }

  let formatter = numberFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    numberFormatters.set(digits, formatter);
  }

  return formatter.format(value);
}

/** Valor com unidade (`"24,7 °C"`, `"61 %"`); unidade vazia (UV) fica só o número. */
export function formatMetricValue(value: number | null | undefined, meta: MetricMeta): string {
  const text = formatNumber(value, meta.digits);
  return text === "—" || meta.unit === "" ? text : `${text} ${meta.unit}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** `"DD/MM/AAAA HH:MM"` no fuso local. Inválido/ausente → `"—"`. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** `"AAAA-MM-DD"` no fuso local, para o nome do arquivo. */
export function fileDateStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
