import { useState } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartCard, type ChartSeries, type ValueBounds } from "./ChartCard";
import { CustomRangePopover, type AppliedRange } from "./CustomRangePopover";
import { PeriodSelector, type PeriodOption } from "./PeriodSelector";
import { ConnectionBanner } from "./ConnectionBanner";
import { seriesQueryOptions } from "../hooks/useSeries";
import { useRawReadings } from "../hooks/useRawReadings";
import type { HistoryReading, Metric, SeriesResponse } from "../api-client";
import type { TimePoint } from "../utils/timeAxis";
import {
  DASHBOARD_MAX_RANGE_DAYS,
  PRESET_RANGES,
  buildSearchWithPeriod,
  getPeriodFromSearch,
  periodLabel,
  periodToWindow,
  type Period,
} from "../utils/period";

/**
 * `ChartsSection` — seletor de período + um `ChartCard` por métrica +
 * "Comparativos", ligados por um único período compartilhado, com skeleton
 * de loading e banner de reconexão (T6.3/T6.4).
 *
 * **Período na URL** (`?range=`, e `&from=&to=` no "Personalizado"): fonte
 * única, compartilhável e lida também pelo export do PDF (`utils/period.ts`).
 * `history.replaceState` (não `pushState`): trocar o período é um filtro,
 * não uma nova página. Sem React Router — uma query string não justifica.
 *
 * **"Personalizado" (pedido do usuário, 2026-11-24)**: mesmo calendário do
 * Histórico (`CustomRangePopover`), limitado a 3 meses
 * (`DASHBOARD_MAX_RANGE_DAYS`, também validado pela API de séries). Escolher a opção só abre o popover; o
 * período (e os gráficos) mudam no "Aplicar". Fechar sem aplicar volta o
 * seletor ao período em vigor.
 *
 * **Eixo de tempo real (revisão física, 2026-11-24)**: cada série vira
 * pontos `{t, v}` e o domínio do eixo X é a janela que a API efetivamente
 * consultou (`SeriesResponse.from/to`) — período sem leituras aparece como
 * vazio, buracos interrompem o traço (ver `ChartCard`).
 *
 * **`useQueries`, não `useSeries` por gráfico (T6.4)**: o status de TODAS as
 * séries precisa ser conhecido aqui (skeleton por card + banner único), e
 * chamar um hook dentro de `.map()` violaria as Rules of Hooks. Mesmas
 * `seriesQueryOptions` de `useSeries` → mesma `queryKey`, mesmo cache.
 */

const RANGE_OPTIONS: PeriodOption[] = [
  { value: "24h", label: "Últimas 24h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "custom", label: "Personalizado" },
];

/**
 * Limites físicos de cada grandeza — o respiro do eixo Y nunca passa deles
 * (revisão física, 2026-11-24: o eixo da umidade chegava a 106 %).
 */
export const METRIC_BOUNDS: Partial<Record<Metric, ValueBounds>> = {
  humidity_pct: { min: 0, max: 100 },
  rain_mm: { min: 0 },
  uv_index: { min: 0 },
};

/** Buckets → pontos no tempo (`avg`, ou `sum` na chuva). Bucket sem valor vira `null`. */
export function bucketsToPoints(
  response: SeriesResponse | undefined,
  field: "avg" | "sum" = "avg",
): TimePoint[] {
  if (!response) {
    return [];
  }
  return response.buckets.map((bucket) => ({ t: new Date(bucket.t).getTime(), v: bucket[field] }));
}

function hasAnyValue(points: TimePoint[]): boolean {
  return points.some((point) => point.v !== null);
}

/**
 * `avg` (default) ou `sum` de cada bucket → 1 série de linha. Sem resposta
 * ou sem nenhum valor → `[]` (o `ChartCard` mostra o `EmptyState`).
 */
export function bucketsToLineSeries(
  response: SeriesResponse | undefined,
  label: string,
  color: string,
  options: { unit?: string; field?: "avg" | "sum"; bounds?: ValueBounds } = {},
): ChartSeries[] {
  const points = bucketsToPoints(response, options.field ?? "avg");
  if (!hasAnyValue(points)) {
    return [];
  }
  return [
    {
      label,
      color,
      points,
      ...(options.unit !== undefined ? { unit: options.unit } : {}),
      ...(options.bounds !== undefined ? { bounds: options.bounds } : {}),
    },
  ];
}

/** `sum` (não `avg`) de cada bucket → 1 série de barras — chuva é volume acumulado no bucket (UI-07). */
export function bucketsToBarSeries(
  response: SeriesResponse | undefined,
  label: string,
  color: string,
): ChartSeries[] {
  const points = bucketsToPoints(response, "sum");
  return hasAnyValue(points) ? [{ label, color, points }] : [];
}

/**
 * TOTAL do período: soma do `sum` de todos os buckets → 1 série com UM único
 * ponto (card "Chuva (Acumulada)", barra única com os mm do período —
 * pedido do usuário, 2026-10-06). Período sem chuva (todos `sum=0`) é uma
 * barra de 0 mm, não um card vazio; nenhum `sum` (sem leituras) → `[]`.
 */
export function bucketsToTotalSeries(
  response: SeriesResponse | undefined,
  label: string,
  color: string,
): ChartSeries[] {
  const values = bucketsToPoints(response, "sum")
    .map((point) => point.v)
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return [];
  }

  // Arredonda a 2 casas: somar floats (0.1 + 0.2...) deixaria resíduos no tooltip.
  const total = Math.round(values.reduce((acc, value) => acc + value, 0) * 100) / 100;
  return [{ label, color, points: [{ t: new Date(response!.to).getTime(), v: total }] }];
}

/** Janela consultada pela API (epoch ms) — domínio do eixo X. */
export function seriesDomain(response: SeriesResponse | undefined): [number, number] | undefined {
  if (!response) {
    return undefined;
  }
  const from = new Date(response.from).getTime();
  const to = new Date(response.to).getTime();
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? [from, to] : undefined;
}

/**
 * Acima disso, os gráficos de pontos desenham 1 a cada N leituras (SVG com
 * dezenas de milhares de círculos trava a página). 3 meses de leituras a
 * cada 15 min (~8800) ficam com 1 a cada 3.
 */
export const MAX_DOTS_PER_SERIES = 3000;

/**
 * Leituras brutas → série de PONTOS ao longo do tempo (decisão do usuário,
 * 2026-11-24: cada ponto é uma leitura real). Acima de `maxPoints`, mantém
 * 1 a cada `stride` leituras — amostragem por passo, SEM média: todo ponto
 * desenhado continua sendo uma medição real da estação.
 */
export function readingsToDotSeries(
  readings: HistoryReading[],
  metric: Metric,
  config: { label: string; color: string; unit: string },
  maxPoints = MAX_DOTS_PER_SERIES,
): { series: ChartSeries[]; stride: number } {
  const points: TimePoint[] = [];
  for (const reading of readings) {
    const value = reading[metric];
    const t = new Date(reading.timestamp).getTime();
    if (value !== null && Number.isFinite(t)) {
      points.push({ t, v: value });
    }
  }

  if (points.length === 0) {
    return { series: [], stride: 1 };
  }

  const stride = Math.max(1, Math.ceil(points.length / maxPoints));
  const sampled = stride === 1 ? points : points.filter((_, index) => index % stride === 0);
  const bounds = METRIC_BOUNDS[metric];
  return {
    series: [
      {
        label: config.label,
        color: config.color,
        unit: config.unit,
        points: sampled,
        ...(bounds ? { bounds } : {}),
      },
    ],
    stride,
  };
}

interface MetricChartConfig {
  metric: Metric;
  title: string;
  /** Cor CSS literal (`var(--sensor-*)`, ver `src/index.css`). */
  color: string;
  variant: "line" | "bar" | "total";
  /** Unidade do eixo Y e do tooltip — mesmos valores de `SensorGrid.SENSORS`. */
  unit: string;
}

/**
 * Ordem/composição do grid (design.md "Layout"): Temp/Umidade, Pressão/Chuva
 * (Distribuição), Chuva (Acumulada)/UV — 2 colunas (md:), 3+3 em `xl:`.
 *
 * Chuva em DOIS cards (2026-10-02): "Distribuição" é o volume de cada
 * bucket (hietograma, barras no tempo); "Acumulada" é UMA barra com o total
 * do período (2026-10-06). Os dois leem a MESMA query de `rain_mm`.
 */
const METRIC_CHARTS: MetricChartConfig[] = [
  {
    metric: "temperature_c",
    title: "Temperatura",
    color: "var(--sensor-temperature)",
    variant: "line",
    unit: "°C",
  },
  {
    metric: "humidity_pct",
    title: "Umidade",
    color: "var(--sensor-humidity)",
    variant: "line",
    unit: "%",
  },
  {
    metric: "pressure_hpa",
    title: "Pressão",
    color: "var(--sensor-pressure)",
    variant: "line",
    unit: "hPa",
  },
  {
    metric: "rain_mm",
    title: "Chuva (Distribuição)",
    color: "var(--sensor-rain)",
    variant: "bar",
    unit: "mm",
  },
  {
    metric: "rain_mm",
    title: "Chuva (Acumulada)",
    color: "var(--sensor-rain)",
    variant: "total",
    unit: "mm",
  },
  {
    metric: "uv_index",
    title: "Índice UV",
    color: "var(--sensor-uv)",
    variant: "line",
    unit: "",
  },
];

/** Uma query por métrica distinta (os 2 cards de chuva compartilham `rain_mm`). */
const METRICS: Metric[] = [...new Set(METRIC_CHARTS.map((config) => config.metric))];

interface PairMetric {
  metric: Metric;
  label: string;
  color: string;
  unit: string;
}

/**
 * Um par comparativo: as 2 grandezas AO LONGO DO TEMPO, em dois cards — as
 * médias por hora/dia em linhas e as leituras brutas em pontos (pedido do
 * usuário, 2026-11-24, que substituiu as dispersões "Y em função de X").
 */
export interface ComparisonPair {
  key: string;
  title: string;
  series: [PairMetric, PairMetric];
}

const TEMPERATURE: PairMetric = {
  metric: "temperature_c",
  label: "Temperatura",
  color: "var(--sensor-temperature)",
  unit: "°C",
};
const HUMIDITY: PairMetric = {
  metric: "humidity_pct",
  label: "Umidade",
  color: "var(--sensor-humidity)",
  unit: "%",
};
const PRESSURE: PairMetric = {
  metric: "pressure_hpa",
  label: "Pressão",
  color: "var(--sensor-pressure)",
  unit: "hPa",
};

export const COMPARISON_PAIRS: ComparisonPair[] = [
  { key: "temperature-humidity", title: "Temperatura e Umidade", series: [TEMPERATURE, HUMIDITY] },
  { key: "temperature-pressure", title: "Temperatura e Pressão", series: [TEMPERATURE, PRESSURE] },
  { key: "humidity-pressure", title: "Umidade e Pressão", series: [HUMIDITY, PRESSURE] },
];

type MetricSeriesResult = UseQueryResult<SeriesResponse, Error>;

/** As 2 séries (médias) de um par, cada uma com unidade e limites próprios. */
function pairLineSeries(
  pair: ComparisonPair,
  resultByMetric: Map<Metric, MetricSeriesResult>,
): ChartSeries[] {
  return pair.series.flatMap((s) =>
    bucketsToLineSeries(resultByMetric.get(s.metric)?.data, s.label, s.color, {
      unit: s.unit,
      bounds: METRIC_BOUNDS[s.metric],
    }),
  );
}

/** As 2 séries (leituras brutas) de um par. */
function pairDotSeries(pair: ComparisonPair, readings: HistoryReading[]): ChartSeries[] {
  return pair.series.flatMap((s) => readingsToDotSeries(readings, s.metric, s).series);
}

/**
 * Placeholder de carregamento inicial de UM card (spec.md: "loading inicial
 * → skeletons, não layout shift"). Mesma árvore de classes do `ChartCard`.
 */
function ChartCardSkeleton({ title }: { title: string }) {
  return (
    <Card data-testid="chartcard-skeleton" size="sm" className="md:[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          <h3>{title}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-40 w-full" />
      </CardContent>
    </Card>
  );
}

function appliedFromPeriod(period: Period): AppliedRange | null {
  return period.range === "custom"
    ? { from: new Date(period.from), to: new Date(period.to) }
    : null;
}

export interface ChartsSectionProps {
  className?: string;
  /** "Agora" injetável para o calendário do personalizado (testes). */
  now?: () => Date;
}

/** Seletor de período + gráficos por métrica + comparativos, com skeleton/banner de reconexão. */
export function ChartsSection({ className = "", now }: ChartsSectionProps) {
  const [period, setPeriod] = useState<Period>(() => getPeriodFromSearch(window.location.search));
  const [selectorValue, setSelectorValue] = useState<string>(period.range);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [applied, setApplied] = useState<AppliedRange | null>(() => appliedFromPeriod(period));

  const seriesWindow = periodToWindow(period);
  const seriesResults = useQueries({
    queries: METRICS.map((metric) => seriesQueryOptions(metric, seriesWindow)),
  });

  // Índice por métrica dos MESMOS resultados acima — cards, pares e totais
  // leem daqui pelo nome da métrica, sem nenhuma query extra.
  const resultByMetric = new Map<Metric, MetricSeriesResult>(
    METRICS.map((metric, index) => [metric, seriesResults[index]!]),
  );

  // Leituras brutas dos gráficos de pontos: mesma janela já resolvida pela
  // API de séries (a da temperatura), para pontos e linhas cobrirem o mesmo
  // intervalo.
  const reference = resultByMetric.get("temperature_c")?.data;
  const raw = useRawReadings(reference?.from, reference?.to);

  // Banner de reconexão (UI-10): erro na busca atual, mas ainda com o último
  // dado bom em cache — nunca esconde os gráficos, só avisa.
  const anyStaleError = seriesResults.some((result) => result.isError && result.data !== undefined);

  function updatePeriod(next: Period) {
    setPeriod(next);
    setSelectorValue(next.range);
    const search = buildSearchWithPeriod(window.location.search, next);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search}${window.location.hash}`,
    );
  }

  function handleSelectorChange(value: string) {
    if (value === "custom") {
      setSelectorValue("custom");
      setCalendarOpen(true);
      return;
    }
    const preset = PRESET_RANGES.find((range) => range === value);
    if (preset) {
      setCalendarOpen(false);
      updatePeriod({ range: preset });
    }
  }

  function handleCalendarOpenChange(open: boolean) {
    setCalendarOpen(open);
    // Fechou sem aplicar: o seletor volta ao período em vigor.
    if (!open && period.range !== "custom") {
      setSelectorValue(period.range);
    }
  }

  function handleApply(from: string, to: string, days: AppliedRange) {
    setApplied(days);
    setCalendarOpen(false);
    updatePeriod({ range: "custom", from, to });
  }

  const totalLabel = periodLabel(period, "short");

  return (
    <section className={`flex flex-col gap-4 ${className}`.trim()}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <PeriodSelector
          options={RANGE_OPTIONS}
          value={selectorValue}
          onChange={handleSelectorChange}
        />
        {selectorValue === "custom" ? (
          <CustomRangePopover
            maxDays={DASHBOARD_MAX_RANGE_DAYS}
            maxLabel="3 meses"
            open={calendarOpen}
            onOpenChange={handleCalendarOpenChange}
            applied={applied}
            onApply={handleApply}
            now={now}
          />
        ) : null}
      </div>
      <ConnectionBanner show={anyStaleError} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {METRIC_CHARTS.map((config) => {
          const result = resultByMetric.get(config.metric)!;

          if (result.isPending) {
            return <ChartCardSkeleton key={config.title} title={config.title} />;
          }

          const series =
            config.variant === "total"
              ? bucketsToTotalSeries(result.data, config.title, config.color)
              : config.variant === "bar"
                ? bucketsToBarSeries(result.data, config.title, config.color)
                : bucketsToLineSeries(result.data, config.title, config.color, {
                    bounds: METRIC_BOUNDS[config.metric],
                  });

          return (
            <ChartCard
              key={config.title}
              title={config.title}
              variant={config.variant}
              series={series}
              domain={seriesDomain(result.data)}
              granularity={result.data?.bucket ?? "hour"}
              unit={config.unit}
              totalLabel={config.variant === "total" ? totalLabel : undefined}
            />
          );
        })}
      </div>

      {/* "Comparativos": 3 pares de grandezas, cada um em 2 cards — médias
          em linhas (em cima) e leituras brutas em pontos (embaixo), tudo
          ao longo do tempo (pedido do usuário, 2026-11-24). */}
      <h2 className="font-heading text-base font-semibold">Comparativos</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {COMPARISON_PAIRS.map((pair) => {
          const linesPending = pair.series.some(
            (s) => resultByMetric.get(s.metric)?.isPending ?? true,
          );
          const pairReference = resultByMetric.get(pair.series[0].metric)?.data;
          // Falha ao buscar as leituras: card vazio (EmptyState), não skeleton eterno.
          const dots = raw.data ? pairDotSeries(pair, raw.data.readings) : raw.isError ? [] : null;

          return (
            <div key={pair.key} data-testid="comparison-column" className="flex flex-col gap-3">
              {linesPending ? (
                <ChartCardSkeleton title={pair.title} />
              ) : (
                <ChartCard
                  title={pair.title}
                  variant="line"
                  series={pairLineSeries(pair, resultByMetric)}
                  domain={seriesDomain(pairReference)}
                  granularity={pairReference?.bucket ?? "hour"}
                />
              )}
              {dots === null ? (
                <ChartCardSkeleton title={pair.title} />
              ) : (
                <ChartCard
                  title={pair.title}
                  variant="dots"
                  series={dots}
                  domain={seriesDomain(reference)}
                  granularity="raw"
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default ChartsSection;
