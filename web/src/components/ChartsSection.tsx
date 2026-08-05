import { useState } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { ChartCard, type ChartSeries } from "./ChartCard";
import { PeriodSelector, type PeriodOption } from "./PeriodSelector";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";
import { ConnectionBanner } from "./ConnectionBanner";
import { seriesQueryOptions } from "../hooks/useSeries";
import { formatTime, formatDayMonth, formatDayMonthUTC } from "../utils/formatTime";
import type { BucketUnit, Metric, Range, SeriesBucket, SeriesResponse } from "../api-client";

/**
 * `ChartsSection` — F6 T6.3/T6.4 (design.md "Layout"/"Arquitetura
 * frontend"): `PeriodSelector` (F5) + um `ChartCard` (F5) por métrica,
 * ligados por um único estado de período compartilhado, com skeleton de
 * loading e banner de reconexão (T6.4). Reusa F5/T6.1 tal como estão — não
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
 *
 * **`useQueries`, não `useSeries` por gráfico (T6.4).** T6.3 chamava
 * `useSeries` dentro de um componente `MetricChart` por métrica — 5
 * instâncias de componente, 5 chamadas de hook, uma por elemento da árvore.
 * T6.4 precisa saber o status (`isPending`/`isError`) de TODAS as 5 séries
 * NO NÍVEL DO `ChartsSection` (pra decidir o skeleton por card e agregar um
 * banner de reconexão único da seção) — chamar `useSeries` dentro de um
 * `.map()` sobre `METRIC_CHARTS` violaria as Rules of Hooks
 * (`react-hooks/rules-of-hooks`, ver `web/.eslintrc.cjs`, mesmo
 * `METRIC_CHARTS` sendo um array de tamanho fixo, o lint não consegue provar
 * isso estaticamente). `useQueries` é o hook do próprio React Query
 * desenhado para "N queries a partir de um array" — usa a mesma definição de
 * query (`seriesQueryOptions`, extraída de `useSeries.ts` nesta tarefa) que
 * `useSeries` usaria, então não há duplicação de `queryKey`/`queryFn`/
 * `placeholderData` nem requests extras (mesma `queryKey` = mesmo cache).
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

/**
 * `t` (UTC) → rótulo no fuso LOCAL do cliente (design.md "Timezone: formatar
 * no cliente a partir de UTC"). T6.4: delega a `formatTime`/`formatDayMonth`
 * (`web/src/utils/formatTime.ts`) em vez de reimplementar o padding
 * `HH:MM`/`DD/MM` aqui — mesma lógica agora compartilhada com
 * `ConnectionBanner` (horário absoluto da última leitura conhecida).
 */
function formatBucketLabel(t: string, unit: BucketUnit): string {
  // bucket="day" (range=30d) é date_trunc('day', ...) em UTC (api/src/db/client.ts
  // força timezone=UTC) — usa formatDayMonthUTC (não reinterpreta no fuso
  // local) para não desalinhar o dia em fusos negativos (ver formatTime.ts).
  return unit === "hour" ? formatTime(t) : formatDayMonthUTC(t);
}

/**
 * Uma label (`formatDayMonth`) por dia LOCAL distinto entre os buckets — o
 * PRIMEIRO bucket de cada dia representa aquele dia (`Date#getFullYear`/
 * `getMonth`/`getDate`, fuso do navegador, mesmo princípio de `formatTime.ts`).
 * Usado só pro range `7d` (feedback do usuário, 2026-07-24, ver `buildXLabels`
 * abaixo) — não genérico pra qualquer bucket "hour", porque em `24h` isso
 * degeneraria pra só 1-2 labels (o range inteiro cabe num único dia local, na
 * prática), sem ganho sobre o par primeiro/último já usado ali.
 */
function uniqueDayLabels(buckets: SeriesBucket[]): string[] {
  const seenDays = new Set<string>();
  const labels: string[] = [];

  for (const bucket of buckets) {
    const date = new Date(bucket.t);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      labels.push(formatDayMonth(bucket.t));
    }
  }

  return labels;
}

/**
 * Rótulos de eixo X — `ChartCard` espalha o array recebido com
 * `justify-between` (N labels igualmente espaçadas, não 1:1 posicional com os
 * pontos, ver uso em `DemoGallery`).
 *
 * **Regra geral (24h/30d)**: só os extremos (primeiro/último bucket) — o
 * range inteiro cabe numa faixa curta o bastante pra dois rótulos bastarem
 * (24h: só horas; 30d: bucket já é `day`, primeiro/último dia já orienta).
 *
 * **`range="7d"` — um marcador POR DIA (feedback do usuário, 2026-07-24)**:
 * diferente de `24h`/`30d`, o bucket de `7d` é `hour` (`RANGE_CONFIG` em
 * `api/src/services/readings-service.ts` — 168 buckets horários, não
 * diários), então o par "primeiro/último" da regra geral mostrava só duas
 * HORAS (ex. "21:00"/"04:00"), sem nenhuma orientação de QUAL dia da semana
 * cada ponto do gráfico representa. `uniqueDayLabels` extrai um rótulo
 * `DD/MM` por dia local distinto presente nos buckets (tipicamente 7-8,
 * dependendo de onde a janela de 7 dias corta o primeiro/último dia).
 */
export function buildXLabels(response: SeriesResponse | undefined): string[] {
  if (!response || response.buckets.length === 0) {
    return [];
  }

  const { buckets, bucket, range } = response;

  if (range === "7d") {
    return uniqueDayLabels(buckets);
  }

  if (buckets.length === 1) {
    return [formatBucketLabel(buckets[0]!.t, bucket)];
  }

  return [formatBucketLabel(buckets[0]!.t, bucket), formatBucketLabel(buckets[buckets.length - 1]!.t, bucket)];
}

/**
 * Extrai `points`/`labels` de `field` ("avg"/"sum") em paralelo — buckets com
 * valor `null` são pulados dos DOIS arrays juntos (mantém o índice de
 * `labels[i]` correspondente a `points[i]`, nunca um dos dois "desalinhando"
 * do outro por causa de um bucket sem dado).
 */
function extractSeriesData(
  buckets: SeriesBucket[],
  field: "avg" | "sum",
  bucketUnit: BucketUnit,
): { points: number[]; labels: string[] } {
  const points: number[] = [];
  const labels: string[] = [];
  for (const bucket of buckets) {
    const value = bucket[field];
    if (value !== null) {
      points.push(value);
      labels.push(formatBucketLabel(bucket.t, bucketUnit));
    }
  }
  return { points, labels };
}

/**
 * `avg` de cada bucket → 1 série de linha (UI-05). `response` undefined
 * (query ainda sem dado) ou sem pontos válidos → `[]`, o que já faz o
 * `ChartCard` mostrar `EmptyState` sozinho (UI-06 AC4).
 *
 * `unit` (4º parâmetro, opcional): popula `ChartSeries.unit` — usado pelos
 * cards "combo" (`COMBO_CHARTS`/`comboSeries` abaixo), onde cada uma das 2
 * séries do card tem sua PRÓPRIA unidade (`ChartCard.tsx`, bullet "Unidade
 * por série"). Omitido (chamada dos 5 cards de métrica única em
 * `METRIC_CHARTS`, inalterada) = `ChartSeries.unit` fica `undefined` e o
 * `ChartCard` cai no `unit` do card inteiro, exatamente como antes desta
 * task — retrocompatibilidade total, sem mudar o array já retornado pelas
 * chamadas existentes (o operador de espalhamento condicional abaixo evita
 * até uma chave `unit: undefined` "a mais" no objeto, pra não depender da
 * semântica de `toEqual` ignorar chaves `undefined`).
 */
export function bucketsToLineSeries(
  response: SeriesResponse | undefined,
  label: string,
  color: string,
  unit?: string,
): ChartSeries[] {
  if (!response) {
    return [];
  }

  const { points } = extractSeriesData(response.buckets, "avg", response.bucket);
  return points.length === 0 ? [] : [{ label, color, points, ...(unit !== undefined ? { unit } : {}) }];
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

  const { points } = extractSeriesData(response.buckets, "sum", response.bucket);
  return points.length === 0 ? [] : [{ label, color, points }];
}

/**
 * Um rótulo de tempo POR PONTO (não só os extremos, ver `buildXLabels`) —
 * usado pelo tooltip de `ChartCard` (feedback do usuário, 2026-07-24: "ao
 * passar o mouse num ponto, tem que ter tooltip"). `field` precisa ser o
 * MESMO usado por `bucketsToLineSeries`/`bucketsToBarSeries` pra essa
 * métrica, senão os rótulos desalinham dos pontos (um bucket com `avg=null`
 * mas `sum` preenchido, por ex., é pulado em `points` de um jeito e não do
 * outro — ver `extractSeriesData`).
 *
 * **`range="7d"` — dia + hora, não só hora (feedback do usuário,
 * 2026-07-24)**: o bucket de `7d` é `hour` (mesma razão de `buildXLabels`
 * acima) — um tooltip só com "14:00" é ambíguo numa janela de 7 dias (QUAL
 * dos 7 dias?). Só nesse range o rótulo vira `"DD/MM HH:MM"` em vez do
 * `formatBucketLabel` padrão. `30d` não precisa desse tratamento: o bucket
 * já é `day`, então `formatBucketLabel` já produz `"DD/MM"` sozinho (um
 * valor médio diário não tem "hora" própria pra mostrar).
 */
export function bucketsToPointLabels(response: SeriesResponse | undefined, field: "avg" | "sum"): string[] {
  if (!response) {
    return [];
  }

  if (response.range === "7d") {
    return response.buckets
      .filter((bucket) => bucket[field] !== null)
      .map((bucket) => `${formatDayMonth(bucket.t)} ${formatTime(bucket.t)}`);
  }

  return extractSeriesData(response.buckets, field, response.bucket).labels;
}

interface MetricChartConfig {
  metric: Metric;
  title: string;
  /** Cor CSS literal (`var(--color-sensor-*)`, ver theme.css) — acento por sensor (docs/design-extraction.md §1.4). */
  color: string;
  variant: "line" | "bar";
  /** Unidade exibida no eixo Y e no tooltip do `ChartCard` (feedback do usuário, 2026-07-24) — mesmos valores usados em `SensorGrid.SENSORS`. */
  unit: string;
}

/**
 * Ordem/composição do grid (design.md "Layout"): Temp/Umidade, Pressão/Chuva, UV
 * — 2 colunas (md:). `xl:grid-cols-3` (feedback do usuário, 2026-07-24)
 * reflui pra 3+2 em telas bem largas, sem espaço vazio óbvio ao lado.
 */
const METRIC_CHARTS: MetricChartConfig[] = [
  { metric: "temperature_c", title: "Temperatura", color: "var(--color-sensor-temperature)", variant: "line", unit: "°C" },
  { metric: "humidity_pct", title: "Umidade", color: "var(--color-sensor-humidity)", variant: "line", unit: "%" },
  { metric: "pressure_hpa", title: "Pressão", color: "var(--color-sensor-pressure)", variant: "line", unit: "hPa" },
  { metric: "rain_mm", title: "Chuva", color: "var(--color-sensor-rain)", variant: "bar", unit: "mm" },
  { metric: "uv_index", title: "Índice UV", color: "var(--color-sensor-uv)", variant: "line", unit: "" },
];

/** Uma das 2 métricas desenhadas num `ComboChartConfig` — vira 1 `ChartSeries` via `bucketsToLineSeries(..., unit)`. */
interface ComboSeriesConfig {
  metric: Metric;
  label: string;
  color: string;
  unit: string;
}

/**
 * Um card "comparativo" (2 métricas sobrepostas no mesmo `ChartCard`,
 * pedido do usuário do produto, 2026-07-24) — não cabe no shape de
 * `MetricChartConfig` (1 métrica só), daí um tipo/array separado e um
 * segundo bloco de renderização abaixo (`COMBO_CHARTS.map`, mesma ideia de
 * `METRIC_CHARTS.map`, mas com uma chave própria — nenhuma metric única
 * identifica o card).
 */
interface ComboChartConfig {
  key: string;
  /**
   * Sempre "line" — ambas as séries dos 3 combos usam `avg`
   * (`bucketsToLineSeries`), inclusive Chuva (ver `series[1]` do combo
   * "uv-rain" abaixo e a nota no próprio título). Não existe hoje um modo
   * bar+linha sobreposto no `ChartCard` (`variant` é um valor só por card,
   * `ChartCard.tsx`) — estender pra isso seria bem mais trabalho (um eixo/
   * geometria por variante desenhados juntos) só pra manter "chuva
   * acumulada" também no combo. Optou-se pela alternativa mais simples:
   * chuva vira MÉDIA (não soma) neste card específico, e o título deixa
   * isso explícito ("chuva média") pra não ser confundido com o card
   * standalone "Chuva" (que continua `variant="bar"`/`sum`, sem nenhuma
   * mudança — ver `METRIC_CHARTS` acima, intocado).
   */
  title: string;
  series: [ComboSeriesConfig, ComboSeriesConfig];
}

/**
 * Os 3 combos pedidos: Temperatura×Umidade, Índice UV×Chuva, Temperatura×
 * Pressão. Todas as 5 métricas aqui já são buscadas pelos 5 `ChartCard`s de
 * `METRIC_CHARTS` (mesmo `range`) — `comboSeries`/`comboIsPending` abaixo
 * leem o MESMO resultado de `useQueries` por `metric` (`resultByMetric`),
 * então nenhuma requisição de rede extra é feita (mesma `queryKey` = mesmo
 * cache do React Query, dedupe automático — ver docstring de
 * `seriesQueryOptions`).
 */
const COMBO_CHARTS: ComboChartConfig[] = [
  {
    key: "temperature-humidity",
    title: "Temperatura × Umidade",
    series: [
      { metric: "temperature_c", label: "Temperatura", color: "var(--color-sensor-temperature)", unit: "°C" },
      { metric: "humidity_pct", label: "Umidade", color: "var(--color-sensor-humidity)", unit: "%" },
    ],
  },
  {
    key: "uv-rain",
    // "chuva média (mm)" no título (não só no rótulo da série): deixa claro
    // de cara que este NÃO é o mesmo dado do card standalone "Chuva"
    // (acumulado/bar) — pedido explícito do usuário do produto pra evitar
    // confusão entre as duas semânticas de chuva coexistindo no dashboard.
    title: "Índice UV × Chuva — chuva média (mm)",
    series: [
      { metric: "uv_index", label: "Índice UV", color: "var(--color-sensor-uv)", unit: "" },
      { metric: "rain_mm", label: "Chuva (média)", color: "var(--color-sensor-rain)", unit: "mm" },
    ],
  },
  {
    key: "temperature-pressure",
    title: "Temperatura × Pressão",
    series: [
      { metric: "temperature_c", label: "Temperatura", color: "var(--color-sensor-temperature)", unit: "°C" },
      { metric: "pressure_hpa", label: "Pressão", color: "var(--color-sensor-pressure)", unit: "hPa" },
    ],
  },
];

type MetricSeriesResult = UseQueryResult<SeriesResponse, Error>;

/** As 2 séries de um combo, já no shape de `ChartCard` (uma por métrica, unidade própria — ver `ComboSeriesConfig.unit`). Métrica sem dado (query pendente/vazia) contribui `[]` (mesma regra de `bucketsToLineSeries`), então um combo com só 1 das 2 métricas preenchida ainda desenha aquela série sozinha (não é tratado como card inteiro vazio, a não ser que AS DUAS estejam vazias — `isEmptySeries` do `ChartCard` já cobre isso). */
function comboSeries(config: ComboChartConfig, resultByMetric: Map<Metric, MetricSeriesResult>): ChartSeries[] {
  return config.series.flatMap((s) => bucketsToLineSeries(resultByMetric.get(s.metric)?.data, s.label, s.color, s.unit));
}

/** Um combo está "carregando" enquanto QUALQUER uma das suas 2 métricas ainda não tem resultado nem cache anterior (`isPending`, mesmo critério usado por `METRIC_CHARTS`/`ChartCardSkeleton` abaixo). */
function comboIsPending(config: ComboChartConfig, resultByMetric: Map<Metric, MetricSeriesResult>): boolean {
  return config.series.some((s) => resultByMetric.get(s.metric)?.isPending ?? true);
}

/** Eixo X / rótulos de tooltip do combo vêm da PRIMEIRA métrica do card (`series[0]`) — escolha arbitrária mas consistente (documentada aqui): as 2 métricas de um combo vêm da MESMA estação/ingestão por bucket (`PROJECT.md`), então os buckets tendem a estar alinhados; se uma métrica tiver um gap que a outra não tem, o rótulo de tempo daquele ponto específico pode desalinhar — limitação preexistente de `pointLabels` ser por CARD, não por série (fora do escopo desta tarefa, que pediu resolver o gap de UNIDADE, não o de rótulo). */
function comboXLabels(config: ComboChartConfig, resultByMetric: Map<Metric, MetricSeriesResult>): string[] {
  return buildXLabels(resultByMetric.get(config.series[0].metric)?.data);
}

function comboPointLabels(config: ComboChartConfig, resultByMetric: Map<Metric, MetricSeriesResult>): string[] {
  return bucketsToPointLabels(resultByMetric.get(config.series[0].metric)?.data, "avg");
}

/**
 * Placeholder de carregamento inicial de UM `ChartCard` (T6.4 — spec.md edge
 * case "loading inicial → skeletons, não layout shift"). Mesma árvore de
 * classes do `ChartCard` real (`Card`, padding, título) — só o corpo
 * (`<svg>` de `h-20`) vira um `Skeleton` do mesmo tamanho, pra não pular o
 * layout quando os dados chegam. O título é mostrado desde já (não depende
 * de dado nenhum), igual ao cabeçalho do `ChartCard` real.
 */
function ChartCardSkeleton({ title }: { title: string }) {
  return (
    <Card
      padding="none"
      data-testid="chartcard-skeleton"
      className="flex flex-col gap-3 p-[12px_14px] md:p-5"
    >
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <Skeleton className="h-20 w-full" />
    </Card>
  );
}

export interface ChartsSectionProps {
  className?: string;
}

/** Seletor de período (`?range=`) + um `ChartCard` por métrica, com skeleton/banner de reconexão (F6 T6.3/T6.4). */
export function ChartsSection({ className = "" }: ChartsSectionProps) {
  const [range, setRange] = useState<Range>(() => getRangeFromSearch(window.location.search));

  const seriesResults = useQueries({
    queries: METRIC_CHARTS.map((config) => seriesQueryOptions(config.metric, range)),
  });

  // Índice por `metric` dos MESMOS 5 resultados acima — os 3 combos
  // (`COMBO_CHARTS`) leem daqui por nome de métrica (não por posição, já que
  // um combo mistura 2 métricas que não são "a próxima da lista"), sem
  // nenhum `useQueries`/`useQuery` adicional (dedupe do React Query, ver
  // docstring de `COMBO_CHARTS`).
  const resultByMetric = new Map<Metric, MetricSeriesResult>(
    METRIC_CHARTS.map((config, index) => [config.metric, seriesResults[index]!]),
  );

  // Banner de reconexão (UI-10): pelo menos uma métrica com a busca atual em
  // erro, mas ainda com `data` em cache (a última série boa conhecida, via
  // `placeholderData: keepPreviousData` de `seriesQueryOptions`) — nunca
  // esconde os gráficos, só avisa que estão desatualizados.
  const anyStaleError = seriesResults.some((result) => result.isError && result.data !== undefined);

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
      <ConnectionBanner show={anyStaleError} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {METRIC_CHARTS.map((config, index) => {
          // `seriesResults` está na MESMA ordem/tamanho de `METRIC_CHARTS`
          // (garantido pelo `useQueries({ queries: METRIC_CHARTS.map(...) })`
          // acima) — índice posicional, não busca por metric.
          const result = seriesResults[index]!;

          if (result.isPending) {
            return <ChartCardSkeleton key={config.metric} title={config.title} />;
          }

          const field = config.variant === "bar" ? "sum" : "avg";
          const series =
            config.variant === "bar"
              ? bucketsToBarSeries(result.data, config.title, config.color)
              : bucketsToLineSeries(result.data, config.title, config.color);

          return (
            <ChartCard
              key={config.metric}
              title={config.title}
              variant={config.variant}
              series={series}
              xLabels={buildXLabels(result.data)}
              pointLabels={bucketsToPointLabels(result.data, field)}
              unit={config.unit}
            />
          );
        })}
      </div>

      {/* "Comparativos" — os 3 combos pedidos (2 métricas por card, ver
          `COMBO_CHARTS`), numa seção própria abaixo do grid de métrica
          única — mesmo grid responsivo (`md:grid-cols-2 xl:grid-cols-3`),
          só com um heading (`<h2>`, mesmo estilo de seção usado em
          `DemoGallery.tsx`) pra separar visualmente as duas categorias de
          card sem misturar 5+3 no mesmo fluxo, o que confundiria "métrica
          única" com "comparativo" pro usuário. */}
      <h2 className="text-base font-semibold text-text-primary">Comparativos</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {COMBO_CHARTS.map((config) => {
          if (comboIsPending(config, resultByMetric)) {
            return <ChartCardSkeleton key={config.key} title={config.title} />;
          }

          return (
            <ChartCard
              key={config.key}
              title={config.title}
              variant="line"
              series={comboSeries(config, resultByMetric)}
              xLabels={comboXLabels(config, resultByMetric)}
              pointLabels={comboPointLabels(config, resultByMetric)}
            />
          );
        })}
      </div>
    </section>
  );
}

export default ChartsSection;
