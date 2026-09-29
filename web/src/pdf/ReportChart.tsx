import { useId } from "react";
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
 * rótulos dos eixos são `<span>`s posicionados por cima, que herdam a
 * tipografia do relatório.
 */
export interface ReportChartProps {
  points: ChartPoint[];
  color: string;
  kind?: "line" | "bar";
  width: number;
  height: number;
  /** Casas decimais dos rótulos do eixo Y. */
  digits: number;
  /** Buckets diários (`range=30d`) já são o dia em UTC — rotula sem converter pro fuso local. */
  utcDays?: boolean;
}

const Y_AXIS_WIDTH = 40;
const X_AXIS_HEIGHT = 18;
const Y_TICKS = 4;
const X_TICKS = 5;
const MS_PER_HOUR = 60 * 60 * 1000;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatXLabel(t: number, spanMs: number, utcDays: boolean): string {
  const date = new Date(t);
  if (utcDays) {
    return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}`;
  }
  if (spanMs <= 36 * MS_PER_HOUR) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/**
 * Domínio Y com folga de 10% (linhas) ou ancorado em zero (barras); valor
 * constante ganha ±1. A folga nunca cruza o zero quando os dados não são
 * negativos: UV, umidade e chuva num eixo que desce a "-0,8" não fazem
 * sentido físico.
 */
function yDomain(values: number[], kind: "line" | "bar"): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (kind === "bar") {
    return [0, max > 0 ? max * 1.1 : 1];
  }
  const floor = min >= 0 ? 0 : -Infinity;
  if (min === max) {
    return [Math.max(floor, min - 1), max + 1];
  }
  const padding = (max - min) * 0.1;
  return [Math.max(floor, min - padding), max + padding];
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
  points,
  color,
  kind = "line",
  width,
  height,
  digits,
  utcDays = false,
}: ReportChartProps) {
  const gradientId = `report-gradient-${useId().replace(/:/g, "")}`;
  const plotWidth = width - Y_AXIS_WIDTH;
  const plotHeight = height - X_AXIS_HEIGHT;
  const values = points.map((point) => point.v).filter((v): v is number => v !== null);

  if (values.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400"
        style={{ width, height }}
      >
        Sem dados no período
      </div>
    );
  }

  const [yMin, yMax] = yDomain(values, kind);
  const tMin = points[0]!.t;
  const tMax = points[points.length - 1]!.t;
  const spanMs = tMax - tMin;

  const scaleY = (v: number) => plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;
  const scaleX = (t: number) => (spanMs === 0 ? plotWidth / 2 : ((t - tMin) / spanMs) * plotWidth);

  const yTicks = Array.from(
    { length: Y_TICKS },
    (_, index) => yMin + ((yMax - yMin) * index) / (Y_TICKS - 1),
  );
  const xTicks =
    spanMs === 0
      ? [tMin]
      : Array.from({ length: X_TICKS }, (_, index) => tMin + (spanMs * index) / (X_TICKS - 1));

  const barSlot = plotWidth / points.length;
  const barWidth = Math.max(1, Math.min(barSlot * 0.7, 18));

  const scaled = points.map((point) => ({
    x: scaleX(point.t),
    y: point.v === null ? null : scaleY(point.v),
  }));
  const segments = segmentsOf(scaled);
  const lastPoint = segments.at(-1)?.at(-1);

  return (
    <div className="relative" style={{ width, height }}>
      {yTicks.map((tick) => (
        <span
          key={`y-${tick}`}
          className="absolute text-[9px] leading-none text-slate-400"
          style={{ left: 0, width: Y_AXIS_WIDTH - 6, top: scaleY(tick) - 4, textAlign: "right" }}
        >
          {formatNumber(tick, digits)}
        </span>
      ))}

      {kind === "bar" && Math.max(...values) <= 0 ? (
        <span
          className="absolute text-[10px] text-slate-400"
          style={{
            left: Y_AXIS_WIDTH,
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
        style={{ position: "absolute", left: Y_AXIS_WIDTH, top: 0, overflow: "visible" }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => (
          <line
            key={`grid-${tick}`}
            x1={0}
            x2={plotWidth}
            y1={scaleY(tick)}
            y2={scaleY(tick)}
            stroke="#e2e8f0"
            strokeWidth={1}
            strokeDasharray={tick === yTicks[0] ? undefined : "3 4"}
          />
        ))}

        {kind === "bar"
          ? points.map((point, index) =>
              point.v === null || point.v <= 0 ? null : (
                <rect
                  key={point.t}
                  x={barSlot * index + (barSlot - barWidth) / 2}
                  y={scaleY(point.v)}
                  width={barWidth}
                  height={plotHeight - scaleY(point.v)}
                  rx={Math.min(3, barWidth / 2)}
                  fill={color}
                  fillOpacity={0.85}
                />
              ),
            )
          : segments.map((segment) => {
              const line = segment
                .map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                .join(" ");
              const first = segment[0]!;
              const last = segment[segment.length - 1]!;
              const area = `${line} L${last.x.toFixed(1)},${plotHeight} L${first.x.toFixed(1)},${plotHeight} Z`;
              return (
                <g key={`${first.x}-${first.y}`}>
                  <path d={area} fill={`url(#${gradientId})`} />
                  <path
                    d={line}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

        {kind === "line" && lastPoint ? (
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={3.5}
            fill="#ffffff"
            stroke={color}
            strokeWidth={2}
          />
        ) : null}
      </svg>

      {xTicks.map((tick, index) => {
        const isFirst = index === 0 && xTicks.length > 1;
        const isLast = index === xTicks.length - 1 && xTicks.length > 1;
        const x = Y_AXIS_WIDTH + scaleX(tick);
        return (
          <span
            key={`x-${tick}`}
            className="absolute text-[9px] leading-none text-slate-400"
            style={{
              top: plotHeight + 6,
              left: isLast ? undefined : x,
              right: isLast ? 0 : undefined,
              transform: isFirst || isLast ? undefined : "translateX(-50%)",
            }}
          >
            {formatXLabel(tick, spanMs, utcDays)}
          </span>
        );
      })}
    </div>
  );
}

export default ReportChart;
