import { useId } from "react";
import { dayBoundaries, formatTick, timeTicks } from "../utils/timeAxis";
import { formatNumber, type ChartPoint } from "./reportData";

/**
 * Gráfico estático do relatório em PDF — SVG puro, sem Recharts. O Recharts
 * depende de `ResponsiveContainer`/animações medidas em tempo de
 * renderização, e o relatório é montado fora da tela e capturado logo em
 * seguida pelo `html2canvas-pro`. Um SVG com coordenadas calculadas aqui
 * sai idêntico em toda exportação.
 *
 * **Só formas no SVG, texto em HTML**: o `html2canvas-pro` pinta o SVG
 * serializado como imagem, e dentro dessa imagem nem a fonte Geist nem as
 * classes do Tailwind se aplicam. Por isso as cores são atributos hex, e os
 * rótulos dos eixos são `<span>`s posicionados por cima.
 *
 * **Mesma física dos gráficos da tela (revisão de 2026-11-24)**:
 * - eixo X = a janela do relatório (`domain`), não a extensão dos dados — o
 *   período em que a estação ficou sem enviar aparece vazio;
 * - `null` interrompe o traço (buracos inseridos por `withGaps`/`seriesToPoints`);
 * - limites físicos por grandeza (`bounds`: umidade nunca passa de 100 %);
 * - divisores de dia tracejados no fundo acima de 2 dias;
 * - até 2 séries (eixo esquerdo e direito, cada um na cor da série) e o tipo
 *   `dots` para leituras brutas ao longo do tempo (comparativos).
 */
export interface ReportSeries {
  points: ChartPoint[];
  color: string;
  /** Casas decimais dos rótulos do eixo Y. */
  digits: number;
  /** Sufixo dos rótulos do eixo (só usado com 2 séries, para distinguir os eixos). */
  unit?: string;
  bounds?: { min?: number; max?: number };
}

export interface ReportChartProps {
  series: ReportSeries[];
  kind?: "line" | "bar" | "dots";
  width: number;
  height: number;
  /** Janela do eixo X (epoch ms). Omitida = extensão dos dados. */
  domain?: readonly [number, number];
  /** Barras: duração de cada bucket (ms), para a largura da barra. */
  bucketMs?: number;
}

const AXIS_WIDTH = 40;
const X_AXIS_HEIGHT = 18;
const Y_TICKS = 4;

function hasValue(point: ChartPoint): point is { t: number; v: number } {
  return point.v !== null && Number.isFinite(point.v);
}

/**
 * Domínio Y com folga de 10% (linhas/pontos) ou ancorado em zero (barras);
 * valor constante ganha ±1. A folga nunca cruza um limite físico, nem o zero
 * quando os dados não são negativos.
 */
export function yDomain(
  values: number[],
  kind: "line" | "bar" | "dots",
  bounds?: { min?: number; max?: number },
): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (kind === "bar") {
    return [0, max > 0 ? max * 1.1 : 1];
  }
  const floor = bounds?.min ?? (min >= 0 ? 0 : -Infinity);
  const ceiling = bounds?.max ?? Infinity;
  const padding = min === max ? 1 : (max - min) * 0.1;
  return [Math.max(floor, min - padding), Math.min(ceiling, max + padding)];
}

/** Segmentos contínuos (quebra o traço em cada `null`). */
function segmentsOf(points: { x: number; y: number | null }[]): { x: number; y: number }[][] {
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];

  for (const point of points) {
    if (point.y === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push({ x: point.x, y: point.y });
    }
  }
  if (current.length > 0) segments.push(current);

  return segments;
}

export function ReportChart({
  series,
  kind = "line",
  width,
  height,
  domain,
  bucketMs,
}: ReportChartProps) {
  const gradientPrefix = `report-gradient-${useId().replace(/:/g, "")}`;
  const visible = series.filter((s) => s.points.some(hasValue)).slice(0, 2);

  if (visible.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400"
        style={{ width, height }}
      >
        Sem dados no período
      </div>
    );
  }

  const dual = visible.length === 2;
  const leftWidth = AXIS_WIDTH;
  const rightWidth = dual ? AXIS_WIDTH : 0;
  const plotWidth = width - leftWidth - rightWidth;
  const plotHeight = height - X_AXIS_HEIGHT;

  const allTimes = visible.flatMap((s) => s.points.filter(hasValue).map((point) => point.t));
  const [tMin, tMax] = domain ?? [Math.min(...allTimes), Math.max(...allTimes)];
  const spanMs = tMax - tMin;
  const scaleX = (t: number) => (spanMs <= 0 ? plotWidth / 2 : ((t - tMin) / spanMs) * plotWidth);

  const axes = visible.map((s) => {
    const values = s.points.filter(hasValue).map((point) => point.v);
    const [yMin, yMax] = yDomain(values, kind, s.bounds);
    const scaleY = (v: number) => plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;
    const ticks = Array.from(
      { length: Y_TICKS },
      (_, index) => yMin + ((yMax - yMin) * index) / (Y_TICKS - 1),
    );
    return { series: s, scaleY, ticks };
  });

  const xTicks = spanMs > 0 ? timeTicks(tMin, tMax) : [tMin];
  const boundaries = dayBoundaries(tMin, tMax);
  const barWidth =
    bucketMs && spanMs > 0
      ? Math.max(1, Math.min(18, (bucketMs / spanMs) * plotWidth * 0.7))
      : Math.max(1, Math.min(18, (plotWidth / Math.max(1, allTimes.length)) * 0.7));

  const primary = axes[0]!;
  const allZero =
    kind === "bar" && Math.max(...primary.series.points.filter(hasValue).map((p) => p.v)) <= 0;

  return (
    <div className="relative" style={{ width, height }}>
      {axes.map((axis, axisIndex) =>
        axis.ticks.map((tick) => (
          <span
            key={`y-${axisIndex}-${tick}`}
            className="absolute text-[9px] leading-none whitespace-nowrap"
            style={{
              top: axis.scaleY(tick) - 4,
              width: AXIS_WIDTH - 6,
              textAlign: axisIndex === 0 ? "right" : "left",
              left: axisIndex === 0 ? 0 : leftWidth + plotWidth + 6,
              color: dual ? axis.series.color : "#94a3b8",
            }}
          >
            {formatNumber(tick, axis.series.digits)}
            {dual && axis.series.unit ? ` ${axis.series.unit}` : ""}
          </span>
        )),
      )}

      {allZero ? (
        <span
          className="absolute text-[10px] text-slate-400"
          style={{
            left: leftWidth,
            width: plotWidth,
            top: plotHeight / 2 - 6,
            textAlign: "center",
          }}
        >
          Sem chuva registrada no período
        </span>
      ) : null}

      <svg
        width={plotWidth}
        height={plotHeight}
        viewBox={`0 0 ${plotWidth} ${plotHeight}`}
        style={{ position: "absolute", left: leftWidth, top: 0, overflow: "visible" }}
        aria-hidden="true"
      >
        <defs>
          {axes.map((axis, index) => (
            <linearGradient
              key={index}
              id={`${gradientPrefix}-${index}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={axis.series.color} stopOpacity={dual ? 0.12 : 0.28} />
              <stop offset="100%" stopColor={axis.series.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {primary.ticks.map((tick) => (
          <line
            key={`grid-${tick}`}
            x1={0}
            x2={plotWidth}
            y1={primary.scaleY(tick)}
            y2={primary.scaleY(tick)}
            stroke="#e2e8f0"
            strokeWidth={1}
            strokeDasharray={tick === primary.ticks[0] ? undefined : "3 4"}
          />
        ))}

        {/* Divisores de dia (meia-noite local), no fundo. */}
        {boundaries.map((t) => (
          <line
            key={`day-${t}`}
            data-day-divider=""
            x1={scaleX(t)}
            x2={scaleX(t)}
            y1={0}
            y2={plotHeight}
            stroke="#cbd5e1"
            strokeWidth={0.75}
            strokeDasharray="2 3"
          />
        ))}

        {axes.map((axis, axisIndex) => {
          const { color } = axis.series;
          const points = axis.series.points;

          if (kind === "bar") {
            return points.map((point) =>
              !hasValue(point) || point.v <= 0 ? null : (
                <rect
                  key={`bar-${axisIndex}-${point.t}`}
                  x={scaleX(point.t) - barWidth / 2}
                  y={axis.scaleY(point.v)}
                  width={barWidth}
                  height={plotHeight - axis.scaleY(point.v)}
                  rx={Math.min(3, barWidth / 2)}
                  fill={color}
                  fillOpacity={0.85}
                />
              ),
            );
          }

          if (kind === "dots") {
            return points
              .filter(hasValue)
              .map((point) => (
                <circle
                  key={`dot-${axisIndex}-${point.t}`}
                  cx={scaleX(point.t)}
                  cy={axis.scaleY(point.v)}
                  r={1.4}
                  fill={color}
                  fillOpacity={0.8}
                />
              ));
          }

          const segments = segmentsOf(
            points.map((point) => ({
              x: scaleX(point.t),
              y: hasValue(point) ? axis.scaleY(point.v) : null,
            })),
          );
          return segments.map((segment) => {
            const line = segment
              .map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(" ");
            const first = segment[0]!;
            const last = segment[segment.length - 1]!;
            const area = `${line} L${last.x.toFixed(1)},${plotHeight} L${first.x.toFixed(1)},${plotHeight} Z`;
            return (
              <g key={`seg-${axisIndex}-${first.x}`}>
                <path d={area} fill={`url(#${gradientPrefix}-${axisIndex})`} />
                <path
                  d={line}
                  fill="none"
                  stroke={color}
                  strokeWidth={dual ? 1.6 : 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {segment.length === 1 ? (
                  <circle cx={first.x} cy={first.y} r={2.5} fill={color} />
                ) : null}
              </g>
            );
          });
        })}
      </svg>

      {xTicks.map((tick, index) => {
        const x = leftWidth + scaleX(tick);
        const isFirst = index === 0 && scaleX(tick) < 20;
        const isLast = index === xTicks.length - 1 && scaleX(tick) > plotWidth - 20;
        return (
          <span
            key={`x-${tick}`}
            className="absolute text-[9px] leading-none whitespace-nowrap text-slate-400"
            style={{
              top: plotHeight + 6,
              left: isLast ? undefined : x,
              right: isLast ? rightWidth : undefined,
              transform: isFirst || isLast ? undefined : "translateX(-50%)",
            }}
          >
            {formatTick(tick, spanMs)}
          </span>
        );
      })}
    </div>
  );
}

export default ReportChart;
