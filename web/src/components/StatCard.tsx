import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "./InfoTooltip";

/**
 * `StatCard` — card de sensor sobre o `Card` do shadcn/ui.
 *
 * Estrutura: `[chip de ícone] ......... [delta ▲/▼/— + texto]` / `[label]` /
 * `[valor grande][unidade]` / `[sparkline SVG]`.
 *
 * - **Estado "sem sinal" (DS-04)**: disparado só por `value === null` — não
 *   existe prop `offline` separada (evita os dois dessincronizarem). Borda
 *   tracejada + fundo apagado; `lastSeenText` é texto livre do chamador.
 * - **Chip de ícone**: fundo translúcido da cor do sensor (opacidade 12% do acento)
 *   com o ícone no acento cheio — funciona igual nos dois temas.
 * - **Delta**: só com `trend`; cor por direção (não por sensor). A seta é
 *   texto visível, a informação não depende só de cor (DS-06).
 * - **Sparkline**: `<polyline>` normalizada pelo min/max da própria série;
 *   com menos de 2 pontos não desenha nada.
 * - **`badge`/`tooltip`**: slots ao lado do label. `badge` só no estado
 *   normal (sem valor não há o que classificar); `tooltip` nos dois, por
 *   explicar o SENSOR e não a leitura atual.
 * - **Número tabular** (`tabular-nums`) evita jitter quando o valor muda
 *   durante o polling.
 */
export type SensorType = "temperature" | "humidity" | "pressure" | "uv" | "rain" | "wind";
export type Trend = "up" | "down" | "flat";

const SENSOR_CHIP_CLASS: Record<SensorType, string> = {
  temperature: "bg-sensor-temperature/12 text-sensor-temperature",
  humidity: "bg-sensor-humidity/12 text-sensor-humidity",
  pressure: "bg-sensor-pressure/12 text-sensor-pressure",
  uv: "bg-sensor-uv/12 text-sensor-uv",
  rain: "bg-sensor-rain/12 text-sensor-rain",
  wind: "bg-sensor-wind/12 text-sensor-wind",
};

const SENSOR_STROKE_CLASS: Record<SensorType, string> = {
  temperature: "stroke-sensor-temperature",
  humidity: "stroke-sensor-humidity",
  pressure: "stroke-sensor-pressure",
  uv: "stroke-sensor-uv",
  rain: "stroke-sensor-rain",
  wind: "stroke-sensor-wind",
};

const TREND_TEXT_CLASS: Record<Trend, string> = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

const TREND_ARROW: Record<Trend, string> = {
  up: "▲",
  down: "▼",
  flat: "—",
};

export interface StatCardProps {
  sensor: SensorType;
  /** Nome de exibição do sensor, ex. "Temperatura". */
  label: string;
  /** `null` dispara a variante "sem sinal" (DS-04). */
  value: number | null;
  unit: string;
  /** Ícone do sensor — deve usar `currentColor` para herdar o acento. */
  icon: ReactNode;
  /** Direção do delta — NÃO é por sensor. Omitido = sem delta. */
  trend?: Trend;
  /** Texto ao lado da seta, ex. "+0.4°C" ou "estável". */
  deltaText?: string;
  /** Valores para o sparkline. Menos de 2 pontos = sem gráfico (sem crash). */
  sparklinePoints?: number[];
  /** Texto livre pro estado "sem sinal", ex. "Última leitura há 3h". */
  lastSeenText?: string;
  /** Badge livre ao lado do label (ex. `UvBadge`), só no estado normal. */
  badge?: ReactNode;
  /** Texto de `InfoTooltip` ao lado do label explicando o cálculo. */
  tooltip?: string;
  className?: string;
}

const SPARKLINE_WIDTH = 100;
const SPARKLINE_HEIGHT = 28;

function Sparkline({ points, strokeClass }: { points: number[] | undefined; strokeClass: string }) {
  if (!points || points.length < 2) {
    return null;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  // Série constante (min === max): evita divisão por zero (linha reta no meio).
  const range = max - min || 1;
  const step = SPARKLINE_WIDTH / (points.length - 1);

  const coords = points
    .map((value, index) => {
      const x = index * step;
      const y = SPARKLINE_HEIGHT - ((value - min) / range) * SPARKLINE_HEIGHT;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-6 w-full md:h-7"
      aria-hidden="true"
      data-testid="sparkline"
    >
      <polyline
        points={coords}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={strokeClass}
      />
    </svg>
  );
}

function LabelRow({
  label,
  tooltip,
  badge,
}: {
  label: string;
  tooltip?: string;
  badge?: ReactNode;
}) {
  return (
    <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground md:text-[13px]">
      {label}
      {tooltip ? (
        <InfoTooltip label={`Como ${label.toLowerCase()} é calculado(a)`}>{tooltip}</InfoTooltip>
      ) : null}
      {badge}
    </p>
  );
}

export function StatCard({
  sensor,
  label,
  value,
  unit,
  icon,
  trend,
  deltaText,
  sparklinePoints,
  lastSeenText,
  badge,
  tooltip,
  className,
}: StatCardProps) {
  const offline = value === null;

  const iconChip = (
    <span
      data-testid="statcard-icon"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4.5",
        offline ? "bg-muted text-muted-foreground" : SENSOR_CHIP_CLASS[sensor],
      )}
    >
      {icon}
    </span>
  );

  if (offline) {
    return (
      <Card
        size="sm"
        data-testid="statcard"
        data-state="offline"
        className={cn(
          "bg-muted/30 shadow-none ring-0 border border-dashed md:[--card-spacing:--spacing(4)]",
          className,
        )}
      >
        <CardContent className="flex flex-col gap-1.5 md:gap-2.5">
          <div className="flex items-center justify-between">{iconChip}</div>
          <LabelRow label={label} tooltip={tooltip} />
          <p className="text-sm font-medium text-muted-foreground">Sem sinal</p>
          {lastSeenText ? <p className="text-xs text-muted-foreground/70">{lastSeenText}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      size="sm"
      data-testid="statcard"
      className={cn("shadow-xs md:[--card-spacing:--spacing(4)]", className)}
    >
      <CardContent className="flex flex-col gap-1.5 md:gap-2.5">
        <div className="flex items-center justify-between">
          {iconChip}
          {trend ? (
            <span className={cn("text-[10px] font-semibold md:text-xs", TREND_TEXT_CLASS[trend])}>
              {TREND_ARROW[trend]}
              {deltaText ? ` ${deltaText}` : ""}
            </span>
          ) : null}
        </div>
        <LabelRow label={label} tooltip={tooltip} badge={badge} />
        <p className="flex items-baseline gap-1">
          <span className="font-heading text-xl font-semibold tabular-nums tracking-tight text-card-foreground md:text-[27px]">
            {value}
          </span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </p>
        <Sparkline points={sparklinePoints} strokeClass={SENSOR_STROKE_CLASS[sensor]} />
      </CardContent>
    </Card>
  );
}

export default StatCard;
