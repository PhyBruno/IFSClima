import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";

/**
 * `ChartCard` — card de gráfico sobre o `Chart` do shadcn/ui (Recharts).
 *
 * - **Linha** vira `AreaChart` (curva monotônica + gradiente sutil, o padrão
 *   visual dos gráficos do shadcn); **barra** vira `BarChart`.
 * - **Várias séries no mesmo card (comparativos)**: cada série ganha o
 *   PRÓPRIO eixo Y (`yAxisId`) — temperatura em °C e umidade em % têm escalas
 *   incompatíveis, então dividir um eixo só achataria uma das curvas. Com
 *   unidades diferentes, o eixo da 1ª série fica à esquerda e o da 2ª à
 *   direita, cada um com sua unidade; com a mesma unidade, o eixo é único.
 * - **Respiro vertical**: o domínio do eixo ganha ~12% acima/abaixo do
 *   min/max (`paddedDomain`), pico/vale nunca encostam na borda do card; nas
 *   barras a base fica em 0 e o respiro é só no topo (`barDomain`).
 * - **Tooltip** do shadcn com a unidade de cada série (`ChartSeries.unit`,
 *   com fallback pro `unit` do card).
 * - **Rótulos do eixo X** continuam vindo de `xLabels` (extremos do período
 *   ou um por dia, calculados em `ChartsSection.buildXLabels`), desenhados
 *   abaixo do gráfico — o XAxis do Recharts fica oculto e só alimenta o
 *   título do tooltip (`pointLabels`).
 * - **Sem dados**: `EmptyState` no lugar do gráfico.
 */
export interface ChartSeries {
  label: string;
  /** Cor CSS literal (hex/rgb/oklch/var) da série. */
  color: string;
  points: number[];
  /** Unidade própria da série (comparativos); omitida = `unit` do card. */
  unit?: string;
}

export type ChartCardVariant = "line" | "bar";

export interface ChartCardProps {
  title: string;
  variant: ChartCardVariant;
  series: ChartSeries[];
  /** Rótulos exibidos abaixo do gráfico (ex. horários dos extremos). */
  xLabels?: string[];
  /** Rótulo de cada ponto, mostrado como título do tooltip. */
  pointLabels?: string[];
  /** Unidade exibida no eixo Y e no tooltip (ex. "°C", "%"). Omitida = sem sufixo. */
  unit?: string;
  className?: string;
}

/** ~12% de respiro no topo/base do eixo Y. */
const Y_PADDING_RATIO = 0.12;

type ChartRow = Record<string, number | string | undefined>;

/** Valor numérico → texto curto (1 casa decimal, sem `.0` quando é inteiro). */
export function formatValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function seriesKey(index: number): string {
  return `s${index}`;
}

function seriesUnit(s: ChartSeries, cardUnit: string): string {
  return s.unit ?? cardUnit;
}

function isEmptySeries(series: ChartSeries[], variant: ChartCardVariant): boolean {
  if (series.length === 0) {
    return true;
  }

  if (variant === "bar") {
    return series[0]!.points.length === 0;
  }

  return series.every((s) => s.points.length === 0);
}

/** Séries (uma lista de pontos cada) → linhas no formato do Recharts, alinhadas por índice. */
export function buildRows(series: ChartSeries[], pointLabels: string[] | undefined): ChartRow[] {
  const length = Math.max(0, ...series.map((s) => s.points.length));

  return Array.from({ length }, (_, index) => {
    const row: ChartRow = { label: pointLabels?.[index] ?? String(index + 1) };
    series.forEach((s, seriesIndex) => {
      row[seriesKey(seriesIndex)] = s.points[index];
    });
    return row;
  });
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

function axisId(seriesIndex: number, sharedAxis: boolean): string {
  return sharedAxis ? "shared" : seriesKey(seriesIndex);
}

export function ChartCard({
  title,
  variant,
  series,
  xLabels,
  pointLabels,
  unit = "",
  className,
}: ChartCardProps) {
  // IDs de gradiente precisam ser únicos NA PÁGINA — vários cards usam as mesmas chaves s0/s1.
  const gradientPrefix = useId().replace(/:/g, "");
  const empty = isEmptySeries(series, variant);
  const visibleSeries = variant === "bar" ? series.slice(0, 1) : series;
  const units = new Set(visibleSeries.map((s) => seriesUnit(s, unit)));
  const sharedAxis = units.size <= 1;
  const rows = empty ? [] : buildRows(visibleSeries, pointLabels);

  const config: ChartConfig = Object.fromEntries(
    visibleSeries.map((s, index) => [seriesKey(index), { label: s.label, color: s.color }]),
  );
  const unitByKey = new Map(
    visibleSeries.map((s, index) => [seriesKey(index), seriesUnit(s, unit)] as const),
  );

  const axes = (sharedAxis ? visibleSeries.slice(0, 1) : visibleSeries).map((s, index) => (
    <YAxis
      key={axisId(index, sharedAxis)}
      yAxisId={axisId(index, sharedAxis)}
      orientation={index === 0 ? "left" : "right"}
      domain={variant === "bar" ? barDomain : paddedDomain}
      tickFormatter={(value: number) => `${formatValue(value)}${seriesUnit(s, unit)}`}
      tickLine={false}
      axisLine={false}
      tickCount={3}
      width={44}
      fontSize={10}
    />
  ));

  const tooltip = (
    <ChartTooltip
      cursor={variant === "bar" ? { fillOpacity: 0.4 } : true}
      content={
        <ChartTooltipContent
          labelKey="label"
          labelFormatter={(_, payload) => payload?.[0]?.payload?.label}
          formatter={(value, name, item) => (
            <div className="flex w-full items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
              <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                {formatValue(Number(value))}
                {unitByKey.get(String(name))}
              </span>
            </div>
          )}
        />
      }
    />
  );

  return (
    <Card
      data-testid="chartcard"
      size="sm"
      className={cn("md:[--card-spacing:--spacing(5)]", className)}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-semibold">
          <h3>{title}</h3>
        </CardTitle>
        {variant === "line" && !empty ? (
          <ul className="flex flex-wrap items-center justify-end gap-3">
            {visibleSeries.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-[2px]"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </li>
            ))}
          </ul>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {empty ? (
          <EmptyState
            title="Nenhum dado no período"
            description="Ajuste o intervalo de datas ou os sensores selecionados"
          />
        ) : (
          <>
            <ChartContainer
              config={config}
              data-testid="chart-svg"
              role="img"
              aria-label={`Gráfico de ${variant === "bar" ? "barras" : "linha"}: ${title}`}
              className="aspect-auto h-36 w-full"
            >
              {variant === "bar" ? (
                <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" hide />
                  {axes}
                  {tooltip}
                  <Bar
                    dataKey={seriesKey(0)}
                    yAxisId={axisId(0, true)}
                    fill={`var(--color-${seriesKey(0)})`}
                    radius={4}
                    // Uma barra só (ex. total de chuva) não pode ocupar o card inteiro.
                    maxBarSize={96}
                    isAnimationActive={false}
                  />
                </BarChart>
              ) : (
                <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" hide />
                  {axes}
                  {tooltip}
                  {visibleSeries.map((s, index) => (
                    <Area
                      key={seriesKey(index)}
                      dataKey={seriesKey(index)}
                      yAxisId={axisId(index, sharedAxis)}
                      type="monotone"
                      stroke={`var(--color-${seriesKey(index)})`}
                      strokeWidth={2}
                      fill={`url(#${gradientPrefix}-fill-${seriesKey(index)})`}
                      dot={s.points.length === 1}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              )}
            </ChartContainer>
            {xLabels && xLabels.length > 0 ? (
              <div
                data-testid="chart-x-labels"
                className={cn(
                  "flex items-center justify-between pl-11 text-[11px] text-muted-foreground",
                  !sharedAxis && "pr-11",
                )}
              >
                {xLabels.map((label, index) => (
                  <span key={index}>{label}</span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ChartCard;
