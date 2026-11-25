import type { HistoryReading, Metric, SeriesResponse } from "../api-client";
import { formatFixed } from "../utils/formatNumber";
import {
  MS_PER_HOUR,
  RAW_MAX_GAP_MS,
  bucketCenter,
  insertGaps,
  maxGapFor,
  startOfLocalDay,
} from "../utils/timeAxis";

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
  /** Limites físicos da grandeza (o eixo nunca passa deles — umidade em 0–100 %). */
  bounds?: { min?: number; max?: number };
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
    bounds: { min: 0, max: 100 },
  },
  {
    metric: "pressure_hpa",
    label: "Pressão",
    unit: "hPa",
    digits: 1,
    color: "#0d9488",
    soft: "#f0fdfa",
  },
  {
    metric: "rain_mm",
    label: "Chuva",
    unit: "mm",
    digits: 1,
    color: "#0891b2",
    soft: "#ecfeff",
    bounds: { min: 0 },
  },
  {
    metric: "uv_index",
    label: "Índice UV",
    unit: "",
    digits: 1,
    color: "#9333ea",
    soft: "#faf5ff",
    bounds: { min: 0 },
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

export interface RainSummary {
  /** Soma de todas as leituras (mm). `null` sem nenhuma leitura de chuva. */
  total: number | null;
  /** Maior volume acumulado numa mesma hora local (mm). */
  maxHourly: number | null;
  /** Dias locais com alguma chuva registrada. */
  rainyDays: number;
}

/**
 * Resumo FÍSICO da chuva (revisão de 2026-11-24): cada leitura é o volume
 * acumulado desde a anterior (~15 min, mas o firmware pode juntar na mesma
 * leitura a chuva de leituras descartadas), então mín/máx POR LEITURA não
 * comparam intervalos iguais. O resumo usa o total do período, o maior
 * volume numa hora (intensidade) e quantos dias choveu.
 */
export function summarizeRain(readings: HistoryReading[]): RainSummary {
  const byHour = new Map<number, number>();
  const rainyDays = new Set<number>();
  let total: number | null = null;

  for (const reading of readings) {
    const value = reading.rain_mm;
    const t = new Date(reading.timestamp).getTime();
    if (!isNumber(value) || !Number.isFinite(t)) {
      continue;
    }
    total = (total ?? 0) + value;
    const hour = Math.floor(t / MS_PER_HOUR);
    byHour.set(hour, (byHour.get(hour) ?? 0) + value);
    if (value > 0) {
      rainyDays.add(startOfLocalDay(t));
    }
  }

  return {
    total,
    maxHourly: byHour.size > 0 ? Math.max(...byHour.values()) : null,
    rainyDays: rainyDays.size,
  };
}

export interface ChartPoint {
  /** Epoch ms. */
  t: number;
  v: number | null;
}

/**
 * Série agregada → pontos do gráfico, no CENTRO de cada bucket (a média das
 * 14h–15h representa 14h30) e com `null` onde falta um bucket inteiro (o
 * traço é interrompido, em vez de ligar dias sem leitura). Chuva usa `sum`
 * (acumulado do bucket), as demais `avg`.
 */
export function seriesToPoints(response: SeriesResponse | undefined): ChartPoint[] {
  if (!response) {
    return [];
  }

  const useSum = response.metric === "rain_mm";
  const points = response.buckets.map((bucket) => ({
    t: bucketCenter(new Date(bucket.t).getTime(), response.bucket),
    v: useSum ? bucket.sum : bucket.avg,
  }));
  return useSum ? points : insertGaps(points, maxGapFor(response.bucket));
}

/** Leituras brutas → pontos do gráfico em ordem cronológica (a API pode devolver `desc`). */
export function readingsToPoints(readings: HistoryReading[], metric: Metric): ChartPoint[] {
  return readings
    .map((reading) => ({ t: new Date(reading.timestamp).getTime(), v: reading[metric] }))
    .filter((point) => Number.isFinite(point.t))
    .sort((a, b) => a.t - b.t);
}

/**
 * Mantém 1 a cada N pontos (com valor) para caber em `maxPoints` —
 * amostragem por passo, sem média: cada ponto continua sendo uma leitura real
 * (gráficos de pontos dos comparativos).
 */
export function sampleEvery(points: ChartPoint[], maxPoints: number): ChartPoint[] {
  const valued = points.filter((point) => isNumber(point.v));
  const stride = Math.max(1, Math.ceil(valued.length / maxPoints));
  return stride === 1 ? valued : valued.filter((_, index) => index % stride === 0);
}

/**
 * Interrompe o traço onde a estação ficou sem enviar: o limite é 1 h ou 2,5×
 * o espaçamento típico dos pontos (depois de `downsample`, cada ponto pode
 * representar várias leituras).
 */
export function withGaps(points: ChartPoint[]): ChartPoint[] {
  if (points.length < 3) {
    return points;
  }
  const deltas = points
    .slice(1)
    .map((point, index) => point.t - points[index]!.t)
    .sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)]!;
  return insertGaps(points, Math.max(RAW_MAX_GAP_MS, median * 2.5));
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

/**
 * Número em pt-BR (`24,7`) com `digits` casas fixas e SEM separador de
 * milhar (`1011,3`, convenção meteorológica e a mesma forma da tela).
 * `null` → `"—"`.
 */
export function formatNumber(value: number | null | undefined, digits: number): string {
  return isNumber(value) ? formatFixed(value, digits) : "—";
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
