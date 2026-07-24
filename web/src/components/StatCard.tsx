import type { ReactNode } from "react";
import { Card } from "./Card";

/**
 * `StatCard` — card de sensor (docs/design-extraction.md §5.1).
 *
 * Estrutura: `[chip de ícone] ......... [delta ▲/▼/— + texto]` / `[label]` /
 * `[valor grande][unidade]` / `[sparkline SVG]`.
 *
 * Decisões de API que não estavam 100% determinadas pela extração:
 *
 * - **Estado nulo/offline (DS-04)**: disparado só por `value === null` — não
 *   existe uma prop `offline` separada. Um sensor sem sinal é, por
 *   definição, um sensor sem valor numérico; não há um caso real onde
 *   `value` exista mas o card ainda assim deva parecer "sem dado" (isso
 *   evitaria os dois ficarem dessincronizados, ex. `offline={true}` com um
 *   `value` numérico esquecido). `lastSeenText` é a prop livre (string já
 *   formatada, ex. "Última leitura há 3h") — a lógica de tempo relativo é do
 *   chamador (F6), igual à decisão já tomada em `StatusPill`.
 *
 * - **Cor do chip de ícone (revisão — feedback do usuário, 2026-07-24)**: a
 *   extração (§1.4/§8.4) documenta um `bg` claro por sensor só para o tema
 *   *light* (ex. `#fff7ed` para temperatura). A primeira versão reaproveitava
 *   `bg-surface-chip` nos dois temas por não existir token pra isso — no
 *   light isso deixava todo chip com o mesmo fundo escuro do dark (`#1c2129`),
 *   visualmente errado. Corrigido com os novos tokens `--color-sensor-*-bg`
 *   (`theme.css`/`tailwind.config.js`): no dark apontam pro chip neutro (sem
 *   mudança de comportamento), no light resolvem pro pastel por sensor do
 *   mock. O **ícone** em si (stroke, via `text-sensor-*`/`currentColor`)
 *   continua carregando a cor de acento do sensor, sem mudança.
 *
 * - **Bg escuro do card offline (§5.1: "surface.sidebar, não surface.card")
 *   nos dois temas**: `bg-surface-sidebar` é aplicado sem condicional de
 *   tema. Isso funciona nos dois temas por uma coincidência real dos tokens,
 *   não por acaso não verificado: no dark, `surface.sidebar` (`#12161d`) é
 *   de fato mais escuro que `surface.card` (`#161b22`), batendo com o
 *   comportamento pedido; no light, `surface.sidebar` e `surface.card` são
 *   **o mesmo branco** (`#ffffff`, §8.1), então aplicar `surface.sidebar`
 *   ali produz exatamente o "no light pode manter surface.card normal" que
 *   a tarefa pede, sem precisar de nenhuma lógica condicional por tema.
 *
 * - **Override de borda/fundo do `Card` no estado offline via `!important`**:
 *   `Card` sempre emite `bg-surface-card`/`border-border-default` (não tem
 *   prop para desligar isso, só `radius` sobrescreve radius). Como o projeto
 *   não usa `tailwind-merge` (ver o próprio comentário em `Card.tsx`), duas
 *   classes de cor do mesmo tipo (`bg-surface-card` vs `bg-surface-sidebar`,
 *   `border-border-default` vs `border-border-dashed`) teriam um vencedor
 *   ambíguo dependendo da ordem de geração do Tailwind. Em vez de duplicar a
 *   lógica de padding/radius do `Card` num `<div>` à parte, sobrescrevemos
 *   com o prefixo `!` (important) do Tailwind, que vence de forma
 *   determinística independente da ordem de geração — mais simples que
 *   duplicar `Card` e ainda reaproveita seu radius/padding.
 *
 * - **Delta**: só renderizado quando `trend` é passado (nenhuma seta é
 *   inventada quando o chamador não sabe a tendência). Cor 100% por direção
 *   (§1.5) — não depende do sensor. A seta (▲/▼/—) é texto normal ao lado do
 *   `deltaText`, não um ícone `aria-hidden` desacompanhado — a informação
 *   não depende só de cor (DS-06).
 *
 * - **Sparkline**: `<svg><polyline>` sem preenchimento, normalizado pelo
 *   min/max da própria série (sem eixo). Com menos de 2 pontos não desenha
 *   nada (uma polyline de 1 ponto não é uma linha) em vez de arriscar um
 *   `NaN`/path degenerado.
 *
 * - **Número tabular**: valor usa `font-bold tabular-nums` + leve
 *   `tracking` negativo (§2: `-0.02em` observado em 27px), evitando jitter
 *   de largura quando o valor muda (ex. polling ao vivo em F6).
 */
export type SensorType = "temperature" | "humidity" | "pressure" | "uv" | "rain" | "wind";
export type Trend = "up" | "down" | "flat";

const SENSOR_ICON_TEXT_CLASS: Record<SensorType, string> = {
  temperature: "text-sensor-temperature",
  humidity: "text-sensor-humidity",
  pressure: "text-sensor-pressure",
  uv: "text-sensor-uv",
  rain: "text-sensor-rain",
  wind: "text-sensor-wind",
};

const SENSOR_STROKE_CLASS: Record<SensorType, string> = {
  temperature: "stroke-sensor-temperature",
  humidity: "stroke-sensor-humidity",
  pressure: "stroke-sensor-pressure",
  uv: "stroke-sensor-uv",
  rain: "stroke-sensor-rain",
  wind: "stroke-sensor-wind",
};

/** Fundo do chip de ícone por sensor — dark: neutro (chip único); light: pastel por sensor (§8.4, feedback do usuário 2026-07-24). */
const SENSOR_CHIP_BG_CLASS: Record<SensorType, string> = {
  temperature: "bg-sensor-temperature-bg",
  humidity: "bg-sensor-humidity-bg",
  pressure: "bg-sensor-pressure-bg",
  uv: "bg-sensor-uv-bg",
  rain: "bg-sensor-rain-bg",
  wind: "bg-sensor-wind-bg",
};

const TREND_TEXT_CLASS: Record<Trend, string> = {
  up: "text-status-positive",
  down: "text-status-negative",
  flat: "text-status-neutral",
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
  /** `null` dispara a variante "sem sinal" (ver DS-04, docstring acima). */
  value: number | null;
  unit: string;
  /** SVG do sensor — deve usar `stroke="currentColor"` para herdar o acento. */
  icon: ReactNode;
  /** Direção do delta — NÃO é por sensor, ver §1.5. Omitido = sem delta. */
  trend?: Trend;
  /** Texto ao lado da seta, ex. "+0.4°C" ou "estável". */
  deltaText?: string;
  /** Valores para o sparkline. Menos de 2 pontos = sem gráfico (sem crash). */
  sparklinePoints?: number[];
  /** Texto livre pro estado offline, ex. "Última leitura há 3h". */
  lastSeenText?: string;
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
  // Série constante (min === max): evita divisão por zero, desenha uma
  // linha reta no meio da altura em vez de espalhar valores para NaN.
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
        className={strokeClass}
      />
    </svg>
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
  className = "",
}: StatCardProps) {
  const offline = value === null;

  const iconChip = (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-10 ${
        offline
          ? "bg-surface-chip text-text-faint"
          : `${SENSOR_CHIP_BG_CLASS[sensor]} ${SENSOR_ICON_TEXT_CLASS[sensor]}`
      }`}
    >
      {icon}
    </span>
  );

  if (offline) {
    return (
      <Card
        padding="none"
        data-testid="statcard"
        className={`flex flex-col gap-1.5 border-dashed !border-border-dashed !bg-surface-sidebar p-[11px] md:gap-2.5 md:p-4 ${className}`.trim()}
      >
        <div className="flex items-center justify-between">{iconChip}</div>
        <p className="text-[11px] font-medium text-text-tertiary md:text-[12.5px]">{label}</p>
        <p className="text-sm font-medium text-text-tertiary">Sem sinal</p>
        {lastSeenText ? <p className="text-xs text-text-disabled">{lastSeenText}</p> : null}
      </Card>
    );
  }

  return (
    <Card
      shadow
      padding="none"
      data-testid="statcard"
      className={`flex flex-col gap-1.5 p-[11px] md:gap-2.5 md:p-4 ${className}`.trim()}
    >
      <div className="flex items-center justify-between">
        {iconChip}
        {trend ? (
          <span className={`text-[10px] font-bold md:text-xs ${TREND_TEXT_CLASS[trend]}`}>
            {TREND_ARROW[trend]}
            {deltaText ? ` ${deltaText}` : ""}
          </span>
        ) : null}
      </div>
      <p className="text-[11px] font-medium text-text-tertiary md:text-[12.5px]">{label}</p>
      <p className="flex items-baseline gap-1">
        <span className="text-[20px] font-bold tabular-nums tracking-[-0.02em] text-text-primary md:text-[27px]">
          {value}
        </span>
        <span className="text-[10.5px] text-text-muted">{unit}</span>
      </p>
      <Sparkline points={sparklinePoints} strokeClass={SENSOR_STROKE_CLASS[sensor]} />
    </Card>
  );
}

export default StatCard;
