import { useId } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { formatDecimal } from "../utils/formatNumber";
import {
  bucketCenter,
  dayBoundaries,
  formatPointTime,
  formatTick,
  insertGaps,
  maxGapFor,
  timeTicks,
  type BucketGranularity,
  type TimePoint,
} from "../utils/timeAxis";
import { EmptyState } from "./EmptyState";

/**
 * `ChartCard` — card de gráfico sobre o `Chart` do shadcn/ui (Recharts).
 *
 * **Eixo X é TEMPO REAL (revisão física, 2026-11-24).** Cada ponto é
 * `{t, v}` e fica na sua posição no tempo; o domínio do eixo é a janela
 * consultada (`domain`), então um período sem leituras aparece vazio em vez
 * de ser comprimido. Buckets agregados são desenhados no CENTRO do intervalo
 * que resumem (`bucketCenter`) e, nas linhas, um buraco maior que 1,5 bucket
 * interrompe o traço (`insertGaps` + `connectNulls={false}`).
 *
 * - **`line`**: `Area` monotônica com gradiente sutil (uma por série).
 * - **`dots`**: um ponto por valor (leituras brutas dos comparativos), sem
 *   ligar os pontos — pedido do usuário, 2026-11-24: "tudo ao longo do tempo".
 * - **`bar`**: barras posicionadas no tempo (chuva por hora/dia).
 * - **`total`**: UMA barra com o total do período (`totalLabel` no tooltip),
 *   sem eixo de tempo.
 * - **Divisores de dia**: acima de 2 dias, linhas tracejadas suaves em cada
 *   meia-noite local, no fundo (é uma 2ª `CartesianGrid`, desenhada por baixo
 *   das séries) — pedido do usuário, 2026-11-24.
 * - **Várias séries (comparativos)**: cada unidade ganha o PRÓPRIO eixo Y
 *   (1ª série à esquerda, 2ª à direita); mesma unidade = eixo único.
 * - **Limites físicos (`ChartSeries.bounds`)**: o respiro vertical
 *   (`paddedDomain`) nunca passa de um limite físico — umidade fica em
 *   [0, 100] %, chuva e UV nunca descem abaixo de 0.
 * - **Sem dados**: `EmptyState` no lugar do gráfico.
 */
export interface ChartSeries {
  label: string;
  /** Cor CSS literal (hex/rgb/oklch/var) da série. */
  color: string;
  points: TimePoint[];
  /** Unidade própria da série (comparativos); omitida = `unit` do card. */
  unit?: string;
  /** Limites físicos da grandeza (ex.: umidade 0–100 %). */
  bounds?: ValueBounds;
}

export interface ValueBounds {
  min?: number;
  max?: number;
}

export type ChartCardVariant = "line" | "dots" | "bar" | "total";

export interface ChartCardProps {
  title: string;
  variant: ChartCardVariant;
  series: ChartSeries[];
  /** Janela do eixo de tempo (epoch ms). Omitida = extensão dos dados. */
  domain?: readonly [number, number];
  /** O que cada ponto representa — posição no eixo, rótulo do tooltip e tolerância de buraco. Default `"raw"`. */
  granularity?: BucketGranularity;
  /** Unidade exibida no eixo Y e no tooltip (ex. "°C", "%"). Omitida = sem sufixo. */
  unit?: string;
  /** Variante `total`: rótulo da barra única no tooltip (ex. "Últimas 24h"). */
  totalLabel?: string;
  /** Linha secundária sob o título (ex. "1 a cada 3 leituras"). */
  description?: string;
  className?: string;
}

/** ~12% de respiro no topo/base do eixo Y. */
const Y_PADDING_RATIO = 0.12;

const CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: 0 };

type ChartRow = Record<string, number | string | null | undefined>;

/** Um ponto da variante `dots`: valor, rótulo de tempo e índice da série (pro tooltip achar cor/unidade). */
interface DotDatum {
  t: number;
  v: number;
  label: string;
  si: number;
}

/** Valor → texto curto pt-BR (1 casa decimal, vírgula, sem `,0` quando é inteiro). */
export function formatValue(value: number): string {
  return formatDecimal(value, 1);
}

function seriesKey(index: number): string {
  return `s${index}`;
}

function seriesUnit(s: ChartSeries, cardUnit: string): string {
  return s.unit ?? cardUnit;
}

function hasValue(point: TimePoint): point is { t: number; v: number } {
  return point.v !== null && Number.isFinite(point.v);
}

function isEmptySeries(series: ChartSeries[], variant: ChartCardVariant): boolean {
  const visible = variant === "bar" || variant === "total" ? series.slice(0, 1) : series;
  return visible.every((s) => !s.points.some(hasValue));
}

/** Domínio do eixo Y com respiro; série constante ganha ±1 pra não virar um eixo de altura zero. */
export function paddedDomain([min, max]: readonly [number, number]): [number, number] {
  const range = max - min;
  if (range === 0) {
    return [min - 1, max + 1];
  }
  const pad = range * Y_PADDING_RATIO;
  return [min - pad, max + pad];
}

/** Domínio do eixo das barras: base sempre 0 (barra é magnitude), respiro só no topo. */
export function barDomain([, max]: readonly [number, number]): [number, number] {
  return [0, max > 0 ? max * (1 + Y_PADDING_RATIO) : 1];
}

/** `paddedDomain` sem ultrapassar os limites físicos (`bounds`). */
export function boundedDomain(
  extent: readonly [number, number],
  bounds: ValueBounds | undefined,
): [number, number] {
  const [low, high] = paddedDomain(extent);
  return [
    bounds?.min !== undefined ? Math.max(bounds.min, low) : low,
    bounds?.max !== undefined ? Math.min(bounds.max, high) : high,
  ];
}

/**
 * Séries → linhas do Recharts, mescladas por TEMPO (não por índice): uma
 * linha por instante distinto, com `s0`, `s1`… de cada série que tem valor
 * naquele instante. Cada série recebe seus `null` de buraco antes da mescla
 * (só nas linhas — barras e pontos não têm traço a interromper). `label` é o
 * rótulo do tooltip, calculado a partir do instante ORIGINAL do ponto (o
 * início do bucket, não o centro onde ele é desenhado).
 */
export function buildRows(
  series: ChartSeries[],
  options: {
    granularity: BucketGranularity;
    domain?: readonly [number, number];
    gaps?: boolean;
  },
): ChartRow[] {
  const rows = new Map<number, ChartRow>();
  const maxGap = maxGapFor(options.granularity);

  series.forEach((s, seriesIndex) => {
    const positioned = s.points.map((point) => ({
      t: bucketCenter(point.t, options.granularity, options.domain),
      v: point.v,
      label: formatPointTime(point.t, options.granularity),
    }));
    const withGaps = options.gaps ? insertGaps(positioned, maxGap) : positioned;

    for (const point of withGaps) {
      const row = rows.get(point.t) ?? { t: point.t };
      row[seriesKey(seriesIndex)] = point.v;
      if ("label" in point) {
        row.label = point.label;
      }
      rows.set(point.t, row);
    }
  });

  return [...rows.values()].sort((a, b) => Number(a.t) - Number(b.t));
}

/**
 * Casas decimais e largura do eixo Y de uma série: amplitude ≥ 10 dispensa
 * decimais nos ticks; a largura acompanha o rótulo mais longo (pressão,
 * "1013,7hPa", não cabe nos 44px de "24,6°C" — revisão visual, 2026-11-24).
 */
export function axisLayout(s: ChartSeries, unit: string): { digits: number; width: number } {
  const values = s.points.filter(hasValue).map((point) => point.v);
  if (values.length === 0) {
    return { digits: 1, width: 44 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const digits = max - min >= 10 ? 0 : 1;
  const longest = Math.max(
    ...[min, max].map((value) => `${formatDecimal(value, digits)},0${unit}`.length),
  );
  return { digits, width: Math.min(68, Math.max(40, longest * 6 + 4)) };
}

function axisId(seriesIndex: number, sharedAxis: boolean): string {
  return sharedAxis ? "shared" : seriesKey(seriesIndex);
}

/** Todas as séries num só eixo (mesma unidade): o layout considera os valores de todas. */
function mergedForAxis(series: ChartSeries[]): ChartSeries {
  return { ...series[0]!, points: series.flatMap((s) => s.points) };
}

/** Extensão de tempo dos dados (quando o card não recebe `domain`). */
function dataDomain(
  series: ChartSeries[],
  granularity: BucketGranularity,
): [number, number] | undefined {
  const times = series.flatMap((s) =>
    s.points.filter(hasValue).map((point) => bucketCenter(point.t, granularity)),
  );
  if (times.length === 0) {
    return undefined;
  }
  return [Math.min(...times), Math.max(...times)];
}

function TooltipValue({
  color,
  name,
  value,
  unit,
}: {
  color: string;
  name: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <span
        className="size-2.5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="text-muted-foreground">{name}</span>
      <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
        {formatValue(value)}
        {unit}
      </span>
    </div>
  );
}

export function ChartCard({
  title,
  variant,
  series,
  domain,
  granularity = "raw",
  unit = "",
  totalLabel,
  description,
  className,
}: ChartCardProps) {
  // IDs de gradiente precisam ser únicos NA PÁGINA — vários cards usam as mesmas chaves s0/s1.
  const gradientPrefix = useId().replace(/:/g, "");
  const empty = isEmptySeries(series, variant);
  const singleSeries = variant === "bar" || variant === "total";
  const visibleSeries = singleSeries ? series.slice(0, 1) : series;
  const units = new Set(visibleSeries.map((s) => seriesUnit(s, unit)));
  const sharedAxis = units.size <= 1;

  const config: ChartConfig = Object.fromEntries(
    visibleSeries.map((s, index) => [seriesKey(index), { label: s.label, color: s.color }]),
  );
  const unitByKey = new Map(
    visibleSeries.map((s, index) => [seriesKey(index), seriesUnit(s, unit)] as const),
  );

  const xDomain = domain ?? dataDomain(visibleSeries, granularity);
  const spanMs = xDomain ? xDomain[1] - xDomain[0] : 0;
  const boundaries = xDomain ? dayBoundaries(xDomain[0], xDomain[1]) : [];

  const axes = (sharedAxis ? visibleSeries.slice(0, 1) : visibleSeries).map((s, index) => {
    const layout = axisLayout(sharedAxis ? mergedForAxis(visibleSeries) : s, seriesUnit(s, unit));
    return (
      <YAxis
        key={axisId(index, sharedAxis)}
        yAxisId={axisId(index, sharedAxis)}
        orientation={index === 0 ? "left" : "right"}
        domain={
          singleSeries
            ? barDomain
            : (extent: readonly [number, number]) => boundedDomain(extent, s.bounds)
        }
        allowDataOverflow={!singleSeries}
        tickFormatter={(value: number) =>
          `${formatDecimal(value, layout.digits)}${seriesUnit(s, unit)}`
        }
        tickLine={false}
        axisLine={false}
        tickCount={3}
        width={layout.width}
        fontSize={10}
        // Pontos (Scatter) leem o valor de `v` em cada ponto da série.
        {...(variant === "dots" ? { dataKey: "v", type: "number" as const } : {})}
      />
    );
  });

  const timeAxis = xDomain ? (
    <XAxis
      type="number"
      dataKey="t"
      domain={xDomain as [number, number]}
      allowDataOverflow
      ticks={timeTicks(xDomain[0], xDomain[1])}
      tickFormatter={(value: number) => formatTick(value, spanMs)}
      tickLine={false}
      axisLine={false}
      height={20}
      fontSize={10}
      // Folga lateral pra o 1º/último rótulo não ser cortado.
      padding={{ left: 4, right: 4 }}
    />
  ) : null;

  // Divisores de dia: 2ª grade, só vertical, nas meias-noites locais (pixels
  // calculados pela mesma escala linear do eixo X).
  const dayGrid =
    boundaries.length > 0 && xDomain ? (
      <CartesianGrid
        horizontal={false}
        strokeDasharray="2 4"
        strokeOpacity={0.6}
        verticalCoordinatesGenerator={({ offset }) => {
          const left = (offset?.left ?? 0) + 4;
          const width = Math.max(0, (offset?.width ?? 0) - 8);
          return boundaries.map(
            (t) => left + ((t - xDomain[0]) / (xDomain[1] - xDomain[0])) * width,
          );
        }}
      />
    ) : null;

  const lineTooltip = (
    <ChartTooltip
      cursor={variant === "bar" || variant === "total" ? { fillOpacity: 0.4 } : true}
      content={
        <ChartTooltipContent
          labelKey="label"
          labelFormatter={(_, payload) =>
            variant === "total" ? totalLabel : payload?.[0]?.payload?.label
          }
          formatter={(value, name, item) => (
            <TooltipValue
              color={item.color ?? ""}
              name={config[String(name)]?.label?.toString() ?? String(name)}
              value={Number(value)}
              unit={unitByKey.get(String(name)) ?? ""}
            />
          )}
        />
      }
    />
  );

  function renderChart() {
    if (variant === "total") {
      const value = visibleSeries[0]?.points.find(hasValue)?.v ?? 0;
      return (
        <BarChart data={[{ label: totalLabel ?? "", s0: value }]} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" hide />
          {axes}
          {lineTooltip}
          <Bar
            dataKey="s0"
            yAxisId={axisId(0, true)}
            fill="var(--color-s0)"
            radius={4}
            maxBarSize={96}
            isAnimationActive={false}
          />
        </BarChart>
      );
    }

    if (variant === "dots") {
      return (
        <ScatterChart margin={CHART_MARGIN}>
          {dayGrid}
          <CartesianGrid vertical={false} />
          {timeAxis}
          {axes}
          <ChartTooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as DotDatum | undefined;
              if (!active || !point) {
                return null;
              }
              const s = visibleSeries[point.si];
              return (
                <div className="grid min-w-32 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <div className="font-medium">{point.label}</div>
                  {s ? (
                    <TooltipValue
                      color={s.color}
                      name={s.label}
                      value={point.v}
                      unit={seriesUnit(s, unit)}
                    />
                  ) : null}
                </div>
              );
            }}
          />
          {visibleSeries.map((s, index) => (
            <Scatter
              key={seriesKey(index)}
              name={s.label}
              yAxisId={axisId(index, sharedAxis)}
              data={s.points.filter(hasValue).map((point): DotDatum => ({
                t: point.t,
                v: point.v,
                label: formatPointTime(point.t, granularity),
                si: index,
              }))}
              fill={`var(--color-${seriesKey(index)})`}
              shape={(props: { cx?: number; cy?: number }) => (
                <circle cx={props.cx} cy={props.cy} r={2} fill={s.color} fillOpacity={0.75} />
              )}
              isAnimationActive={false}
            />
          ))}
        </ScatterChart>
      );
    }

    const rows = buildRows(visibleSeries, {
      granularity,
      domain: xDomain,
      gaps: variant === "line",
    });

    return (
      <ComposedChart data={rows} margin={CHART_MARGIN}>
        {variant === "line" ? (
          <defs>
            {visibleSeries.map((_, index) => (
              <linearGradient
                key={seriesKey(index)}
                id={`${gradientPrefix}-fill-${seriesKey(index)}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor={`var(--color-${seriesKey(index)})`}
                  stopOpacity={0.35}
                />
                <stop
                  offset="95%"
                  stopColor={`var(--color-${seriesKey(index)})`}
                  stopOpacity={0.02}
                />
              </linearGradient>
            ))}
          </defs>
        ) : null}
        {dayGrid}
        <CartesianGrid vertical={false} />
        {timeAxis}
        {axes}
        {lineTooltip}
        {variant === "bar" ? (
          <Bar
            dataKey="s0"
            yAxisId={axisId(0, true)}
            fill="var(--color-s0)"
            radius={2}
            maxBarSize={24}
            isAnimationActive={false}
          />
        ) : (
          visibleSeries.map((s, index) => (
            <Area
              key={seriesKey(index)}
              dataKey={seriesKey(index)}
              yAxisId={axisId(index, sharedAxis)}
              type="monotone"
              stroke={`var(--color-${seriesKey(index)})`}
              strokeWidth={2}
              fill={`url(#${gradientPrefix}-fill-${seriesKey(index)})`}
              dot={s.points.filter(hasValue).length === 1}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))
        )}
      </ComposedChart>
    );
  }

  const ariaKind = {
    line: "linha",
    dots: "pontos",
    bar: "barras",
    total: "barras",
  }[variant];

  return (
    <Card
      data-testid="chartcard"
      size="sm"
      className={cn("md:[--card-spacing:--spacing(5)]", className)}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-sm font-semibold">
            <h3>{title}</h3>
          </CardTitle>
          {description ? (
            <CardDescription className="text-xs">{description}</CardDescription>
          ) : null}
        </div>
        {variant === "total" && !empty ? (
          // O total escrito no cabeçalho: um período seco (0 mm) não tem barra visível.
          <span
            data-testid="chart-total"
            className="font-heading text-lg font-semibold tabular-nums text-card-foreground"
          >
            {formatValue(visibleSeries[0]?.points.find(hasValue)?.v ?? 0)}
            {unit ? <span className="ml-1 text-xs text-muted-foreground">{unit}</span> : null}
          </span>
        ) : null}
        {(variant === "line" || variant === "dots") && !empty ? (
          <ul className="flex flex-wrap items-center justify-end gap-3">
            {visibleSeries.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={cn("size-2", variant === "dots" ? "rounded-full" : "rounded-[2px]")}
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </li>
            ))}
          </ul>
        ) : null}
      </CardHeader>

      <CardContent>
        {empty ? (
          <EmptyState
            title="Nenhum dado no período"
            description="Ajuste o intervalo de datas ou os sensores selecionados"
          />
        ) : (
          <ChartContainer
            config={config}
            data-testid="chart-svg"
            data-day-dividers={boundaries.length}
            role="img"
            aria-label={`Gráfico de ${ariaKind}: ${title}`}
            className="aspect-auto h-40 w-full"
          >
            {renderChart()}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default ChartCard;
