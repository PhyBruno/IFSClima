import { useState } from "react";
import { ChartCard, type ChartSeries } from "./ChartCard";
import { PeriodSelector, type PeriodOption } from "./PeriodSelector";
import { useSeries } from "../hooks/useSeries";
import type { BucketUnit, Metric, Range, SeriesBucket, SeriesResponse } from "../api-client";

/**
 * `ChartsSection` — F6 T6.3 (design.md "Layout"/"Arquitetura frontend"):
 * `PeriodSelector` (F5) + um `ChartCard` (F5) por métrica, ligados por um
 * único estado de período compartilhado. Reusa F5/T6.1 tal como estão — não
 * recria seletor, cartão de gráfico, client HTTP nem hooks de dados.
 *
 * **Período em `?range=` (URL), não `useState` "solto"**: design.md decide
 * isso explicitamente ("fonte única, default 24h, recarrega todos os
 * gráficos ao trocar" — UI-06). Não há React Router instalado (`web/
 * package.json`) e adicionar um só para uma única query string seria
 * desproporcional — a leitura/escrita usa `URLSearchParams`/`window.history`
 * diretamente. `history.replaceState` (não `pushState`): trocar o período é
 * um filtro, não uma nova "página" — não queremos empilhar uma entrada de
 * histórico por clique no seletor.
 *
 * **Recharts não é usado aqui.** A tarefa pede para conferir se `ChartCard`
 * (F5) já embrulha Recharts internamente antes de adicionar a lib — não
 * embrulha (é SVG customizado, `ChartCard.tsx`, sem import de `recharts`) e
 * já implementa sozinho tudo que os critérios de aceite pedem (linha
 * multi-série, barras, estado vazio). Adicionar `recharts` como dependência
 * sem nenhum componente consumindo-o seria peso morto — a instrução do
 * prompt ("se ele já usa Recharts, você só precisa consumir a API") aponta
 * justamente para tratar `ChartCard` como a fronteira de abstração, que é o
 * que este arquivo faz.
 *
 * **Sem banda min/max sobreposta.** `ChartCard` normaliza cada série
 * independentemente pelo seu PRÓPRIO min/max (ver docstring de
 * `ChartCard.tsx`) — não há uma escala compartilhada entre séries. Desenhar
 * `min`/`max` como séries adicionais nesse modelo não produziria uma banda
 * visualmente correta ao redor de `avg` (cada uma ocuparia a altura toda do
 * card, normalizada ao seu próprio intervalo, distorcendo a leitura em vez
 * de ilustrar variação) — por isso "quando fizer sentido" (spec.md AC2) aqui
 * significa: não faz sentido dado o modelo de normalização atual do
 * `ChartCard`, então só `avg` é desenhado. `min`/`max` continuam disponíveis
 * no payload para uma extensão futura que dê ao `ChartCard` um modo de banda
 * de verdade (fora do escopo desta tarefa — não é alteração de F5).
 */

const RANGE_VALUES: Range[] = ["24h", "7d", "30d"];

const RANGE_OPTIONS: PeriodOption[] = [
  { value: "24h", label: "Últimas 24h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

const RANGE_QUERY_PARAM = "range";
const DEFAULT_RANGE: Range = "24h";

function isRange(value: string | null): value is Range {
  return value !== null && (RANGE_VALUES as string[]).includes(value);
}

/** Lê `?range=` de uma query string (`location.search`); default `24h` se ausente/inválida. */
export function getRangeFromSearch(search: string): Range {
  const value = new URLSearchParams(search).get(RANGE_QUERY_PARAM);
  return isRange(value) ? value : DEFAULT_RANGE;
}

/** Devolve uma nova query string com `?range=` setado, preservando os demais parâmetros. */
export function buildSearchWithRange(search: string, range: Range): string {
  const params = new URLSearchParams(search);
  params.set(RANGE_QUERY_PARAM, range);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** `t` (UTC) → rótulo no fuso LOCAL do cliente (design.md "Timezone: formatar no cliente a partir de UTC"). */
function formatBucketLabel(t: string, unit: BucketUnit): string {
  const date = new Date(t);
  return unit === "hour"
    ? `${pad(date.getHours())}:${pad(date.getMinutes())}`
    : `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** Rótulos de eixo X: só extremos (primeiro/último bucket) — `ChartCard` espalha o array recebido com `justify-between`, não é 1:1 posicional com os pontos (ver uso em `DemoGallery`). */
export function buildXLabels(response: SeriesResponse | undefined): string[] {
  if (!response || response.buckets.length === 0) {
    return [];
  }

  const { buckets, bucket } = response;
  if (buckets.length === 1) {
    return [formatBucketLabel(buckets[0]!.t, bucket)];
  }

  return [formatBucketLabel(buckets[0]!.t, bucket), formatBucketLabel(buckets[buckets.length - 1]!.t, bucket)];
}

function numericPoints(buckets: SeriesBucket[], field: "avg" | "sum"): number[] {
  const points: number[] = [];
  for (const bucket of buckets) {
    const value = bucket[field];
    if (value !== null) {
      points.push(value);
    }
  }
  return points;
}

/** `avg` de cada bucket → 1 série de linha (UI-05). `response` undefined (query ainda sem dado) ou sem pontos válidos → `[]`, o que já faz o `ChartCard` mostrar `EmptyState` sozinho (UI-06 AC4). */
export function bucketsToLineSeries(
  response: SeriesResponse | undefined,
  label: string,
  color: string,
): ChartSeries[] {
  if (!response) {
    return [];
  }

  const points = numericPoints(response.buckets, "avg");
  return points.length === 0 ? [] : [{ label, color, points }];
}

/** `sum` (não `avg`) de cada bucket → 1 série de barras — chuva é acumulada, não uma média (UI-07/spec.md AC3). */
export function bucketsToBarSeries(
  response: SeriesResponse | undefined,
  label: string,
  color: string,
): ChartSeries[] {
  if (!response) {
    return [];
  }

  const points = numericPoints(response.buckets, "sum");
  return points.length === 0 ? [] : [{ label, color, points }];
}

interface MetricChartConfig {
  metric: Metric;
  title: string;
  /** Cor CSS literal (`var(--color-sensor-*)`, ver theme.css) — acento por sensor (docs/design-extraction.md §1.4). */
  color: string;
  variant: "line" | "bar";
}

/** Ordem/composição do grid (design.md "Layout"): Temp/Umidade, Pressão/Chuva, UV. */
const METRIC_CHARTS: MetricChartConfig[] = [
  { metric: "temperature_c", title: "Temperatura", color: "var(--color-sensor-temperature)", variant: "line" },
  { metric: "humidity_pct", title: "Umidade", color: "var(--color-sensor-humidity)", variant: "line" },
  { metric: "pressure_hpa", title: "Pressão", color: "var(--color-sensor-pressure)", variant: "line" },
  { metric: "rain_mm", title: "Chuva", color: "var(--color-sensor-rain)", variant: "bar" },
  { metric: "uv_index", title: "Índice UV", color: "var(--color-sensor-uv)", variant: "line" },
];

function MetricChart({ config, range }: { config: MetricChartConfig; range: Range }) {
  const { data } = useSeries(config.metric, range);
  const series =
    config.variant === "bar"
      ? bucketsToBarSeries(data, config.title, config.color)
      : bucketsToLineSeries(data, config.title, config.color);

  return (
    <ChartCard
      title={config.title}
      variant={config.variant}
      series={series}
      xLabels={buildXLabels(data)}
    />
  );
}

export interface ChartsSectionProps {
  className?: string;
}

/** Seletor de período (`?range=`) + um `ChartCard` por métrica (F6 T6.3). */
export function ChartsSection({ className = "" }: ChartsSectionProps) {
  const [range, setRange] = useState<Range>(() => getRangeFromSearch(window.location.search));

  function handleRangeChange(value: string) {
    if (!isRange(value)) {
      return;
    }

    setRange(value);
    const search = buildSearchWithRange(window.location.search, value);
    window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
  }

  return (
    <section className={`flex flex-col gap-4 ${className}`.trim()}>
      <PeriodSelector options={RANGE_OPTIONS} value={range} onChange={handleRangeChange} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {METRIC_CHARTS.map((config) => (
          <MetricChart key={config.metric} config={config} range={range} />
        ))}
      </div>
    </section>
  );
}

export default ChartsSection;
