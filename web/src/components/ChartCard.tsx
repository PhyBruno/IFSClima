import { useState } from "react";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";

/**
 * `ChartCard` — UM card de gráfico (docs/design-extraction.md §5.2). O grid
 * de dois ChartCards lado a lado é decisão de layout de quem compõe (F6),
 * fora do escopo daqui.
 *
 * Decisões de API que não estavam 100% determinadas pela extração:
 *
 * - **`series[].color`** é uma cor CSS literal (hex/rgb), não uma chave de
 *   sensor — usada via `style`/atributo `stroke`/`fill` diretamente, nunca
 *   como classe Tailwind dinâmica (uma classe tipo `stroke-${color}`
 *   simplesmente não existiria, já que o Tailwind escaneia o código-fonte
 *   por classes literais, não resolve valores em runtime). Quem compõe
 *   (F6) decide a cor — tipicamente `var(--color-sensor-*)` resolvido via
 *   `getComputedStyle` ou os hexes de §1.4, mas isso não é responsabilidade
 *   deste componente.
 *
 * - **Normalização do eixo Y**: cada série é normalizada independentemente
 *   pelo seu próprio min/max (não uma escala global compartilhada). Isso
 *   NÃO mudou nesta revisão — só o que mudou é que agora HÁ eixo Y visível
 *   (ver "Escala lateral" abaixo), calculado a partir da união de todos os
 *   pontos desenhados. Na prática o app real (`ChartsSection`) só passa UMA
 *   série por `ChartCard` de linha, então "união de todos os pontos" e "min/
 *   max da série" coincidem sempre — a diferença só apareceria no cenário
 *   hipotético de 2+ séries simultâneas (só visto em `DemoGallery`), onde a
 *   escala mostrada passa a ser a combinada, não mais uma por série (mudança
 *   aceitável: ainda é um min/max real dos dados exibidos, não inventado).
 *
 * - **Barras usam baseline 0, não min/max**: diferente da linha, o
 *   `variant="bar"` normaliza contra `[0, max]` — dado que o único caso
 *   observado (chuva acumulada) é uma grandeza que não é negativa, uma
 *   barra com baseline no mínimo da série distorceria a leitura visual
 *   ("chuva zero" pareceria uma barra do mesmo tamanho que qualquer outra
 *   se todos os valores fossem próximos e o baseline fosse o mínimo).
 *
 * - **Margem vertical (headroom) — feedback do usuário, 2026-07-24**: antes,
 *   o pico/vale de uma série tocava exatamente as bordas do card (`y=0`/
 *   `y=VIEWBOX_HEIGHT`), "cortando" a escala visualmente. `Y_PADDING_RATIO`
 *   reserva ~12% de respiro no topo (linha e barra) e também na base (só
 *   linha — barra mantém baseline 0 fixo, é o próprio "chão" do gráfico).
 *
 * - **Pontos + tooltip (feedback do usuário, 2026-07-24)**: cada ponto de
 *   dado agora tem um marcador visível (`<circle>`) e um alvo de hover/foco
 *   maior (invisível, na linha; o próprio `<rect>` na barra, que já é uma
 *   área grande o bastante) — ao passar o mouse OU focar via teclado (Tab),
 *   um tooltip mostra o rótulo de tempo (se fornecido via `pointLabels`) e o
 *   valor formatado com a unidade (`unit`). Sem lib nova: é um `<div>`
 *   posicionado via estado local (`hover`), usando as MESMAS coordenadas
 *   (percentuais) calculadas pro ponto/barra.
 *
 * - **Escala lateral (eixo Y) — feedback do usuário, 2026-07-24**: uma
 *   coluna estreita à esquerda do SVG com o valor máximo (topo) e mínimo
 *   (base) da série (barra: sempre `0` na base). Formatado com `formatValue`
 *   local (1 casa decimal, sem casas quando é inteiro) + `unit` (prop nova,
 *   opcional — sem valor, os rótulos saem sem sufixo).
 *
 * - **`variant="bar"` com múltiplas séries**: só a primeira (`series[0]`) é
 *   desenhada; entradas extras são ignoradas silenciosamente (documentado
 *   aqui, sem lançar erro) — o design nunca mostra mais de uma série em
 *   barra, e falhar/lançar exceção por um prop shape "errado" seria mais
 *   frágil do que necessário para um componente de apresentação.
 *
 * - **Estado vazio (DS-04)**: `EmptyState` (reaproveitado de T5.3a) é
 *   renderizado no lugar do `<svg>` quando não há o que desenhar — cenário
 *   real, não hipotético (F4 `READ-08`: séries vazias retornam `buckets:
 *   []`). A checagem é ciente do `variant`: em `line`, "vazio" é `series`
 *   vazio OU todas as séries com `points` vazio (todas são desenhadas); em
 *   `bar`, só `series[0]` é desenhado (ver decisão acima), então "vazio" é
 *   `series` vazio OU `series[0].points` vazio — mesmo que uma série
 *   IGNORADA (`series[1]`, etc.) tenha pontos, o card mostra `EmptyState`,
 *   nunca um `<svg>` com zero barras. Uma série individual com só 1 ponto
 *   (não vazia, mas insuficiente pra linha) não dispara o empty-state geral
 *   — só aquela polyline específica não é desenhada (mesma lógica do
 *   sparkline do `StatCard`, sem crash); ela também não entra na escala do
 *   eixo Y nem ganha tooltip (não há coordenada de linha pra ela).
 *
 * - **Flat sempre**: nunca recebe `shadow` do `Card` — §3.3/§8.8 confirmam
 *   que ChartCard não tem sombra em nenhum dos dois temas.
 */
export interface ChartSeries {
  label: string;
  /** Cor CSS literal (hex/rgb/var), aplicada via `stroke`/`fill` inline. */
  color: string;
  points: number[];
}

export type ChartCardVariant = "line" | "bar";

export interface ChartCardProps {
  title: string;
  variant: ChartCardVariant;
  series: ChartSeries[];
  /** Labels do eixo X (ex. horários), renderizados abaixo do SVG. Só os extremos costumam ser passados (ver `ChartsSection.buildXLabels`). */
  xLabels?: string[];
  /**
   * Um rótulo de tempo POR PONTO (mesmo índice/ordem de `series[0].points`
   * em `variant="line"`, ou de `points` em `variant="bar"`) — usado só no
   * tooltip de hover/foco, não no eixo X compacto (`xLabels`, inalterado).
   * Omitido = tooltip mostra só o valor, sem rótulo de tempo.
   */
  pointLabels?: string[];
  /** Unidade exibida no eixo Y e no tooltip (ex. "°C", "%"). Omitida = sem sufixo. */
  unit?: string;
  className?: string;
}

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 40;
/** ~12% de respiro no topo/base — pico/vale nunca toca a borda do card (feedback do usuário, 2026-07-24). */
const Y_PADDING_RATIO = 0.12;
const TOP_PADDING = VIEWBOX_HEIGHT * Y_PADDING_RATIO;
const USABLE_HEIGHT_LINE = VIEWBOX_HEIGHT * (1 - 2 * Y_PADDING_RATIO);
const USABLE_HEIGHT_BAR = VIEWBOX_HEIGHT - TOP_PADDING;

/** Valor numérico → texto curto (1 casa decimal, sem `.0` quando é inteiro). Sem lib de formatação — mesmo princípio de `formatAge`/`formatTime` (utils já existentes no projeto). */
function formatValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * "Vazio" depende do que o variant de fato desenha: `line` desenha todas as
 * séries, mas `bar` só desenha `series[0]` (o resto é ignorado, ver
 * docstring do componente) — checar todas as séries no modo `bar` erraria
 * o estado vazio quando `series[0]` está vazio mas uma série IGNORADA tem
 * pontos (renderizaria um `<svg>` sem barra nenhuma em vez do `EmptyState`).
 */
function isEmptySeries(series: ChartSeries[], variant: ChartCardVariant): boolean {
  if (series.length === 0) {
    return true;
  }

  if (variant === "bar") {
    // Guardado por `series.length === 0` acima — `series[0]` sempre existe aqui.
    return series[0]!.points.length === 0;
  }

  return series.every((s) => s.points.length === 0);
}

/** Mapeia `value` (dentro de `[min,max]`) pra uma coordenada Y com respiro (`Y_PADDING_RATIO`) no topo E na base — nunca `0` nem `VIEWBOX_HEIGHT` exatos. */
function scaleYWithHeadroom(value: number, min: number, max: number): number {
  const range = max - min || 1;
  return VIEWBOX_HEIGHT - TOP_PADDING - ((value - min) / range) * USABLE_HEIGHT_LINE;
}

export interface HoverInfo {
  /** Posição horizontal em % (0-100), mesma escala de `VIEWBOX_WIDTH`. */
  xPercent: number;
  /** Posição vertical em % (0-100) dentro da área do SVG. */
  yPercent: number;
  text: string;
}

function tooltipText(label: string | undefined, value: number, unit: string): string {
  const formatted = `${formatValue(value)}${unit}`;
  return label ? `${label} — ${formatted}` : formatted;
}

interface LineChartProps {
  series: ChartSeries[];
  pointLabels: string[] | undefined;
  unit: string;
  onHover: (info: HoverInfo | null) => void;
}

function LineChart({ series, pointLabels, unit, onHover }: LineChartProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-20 w-full"
      role="group"
      aria-label="Gráfico de linha"
      data-testid="chart-svg"
    >
      {series.map((s, seriesIndex) => {
        // Menos de 2 pontos: não dá pra desenhar uma linha, pula esta série
        // (sem crash), igual à regra do sparkline do StatCard.
        if (s.points.length < 2) {
          return null;
        }

        const min = Math.min(...s.points);
        const max = Math.max(...s.points);
        const step = VIEWBOX_WIDTH / (s.points.length - 1);
        const coords = s.points.map((value, pointIndex) => ({
          x: pointIndex * step,
          y: scaleYWithHeadroom(value, min, max),
          value,
        }));

        return (
          <g key={s.label}>
            <polyline
              points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            />
            {coords.map((c, pointIndex) => {
              const key = `${seriesIndex}-${pointIndex}`;
              const isActive = activeKey === key;
              const label = pointLabels?.[pointIndex];

              function activate() {
                setActiveKey(key);
                onHover({
                  xPercent: c.x,
                  yPercent: (c.y / VIEWBOX_HEIGHT) * 100,
                  text: tooltipText(label, c.value, unit),
                });
              }

              function deactivate() {
                setActiveKey(null);
                onHover(null);
              }

              return (
                <g key={key}>
                  <circle cx={c.x} cy={c.y} r={isActive ? 2.2 : 1.4} fill={s.color} aria-hidden="true" />
                  {/* Alvo de hover/foco maior que o marcador visível — mais fácil de acertar com o mouse, e focável via Tab (acessibilidade por teclado). */}
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={3.5}
                    fill="transparent"
                    tabIndex={0}
                    data-testid="chart-point-hit"
                    aria-label={tooltipText(label, c.value, unit)}
                    onMouseEnter={activate}
                    onMouseLeave={deactivate}
                    onFocus={activate}
                    onBlur={deactivate}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

// Só renderizado quando `isEmptySeries` (variant="bar") já confirmou
// `points.length > 0` — não precisa de guarda própria contra array vazio.
interface BarChartProps {
  points: number[];
  color: string;
  pointLabels: string[] | undefined;
  unit: string;
  onHover: (info: HoverInfo | null) => void;
}

function BarChart({ points, color, pointLabels, unit, onHover }: BarChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const max = Math.max(...points, 0);
  const barGap = 4;
  const barWidth = (VIEWBOX_WIDTH - barGap * (points.length - 1)) / points.length;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-20 w-full"
      role="group"
      aria-label="Gráfico de barras"
      data-testid="chart-svg"
    >
      {points.map((value, index) => {
        const height = max > 0 ? (value / max) * USABLE_HEIGHT_BAR : 0;
        const x = index * (barWidth + barGap);
        const y = VIEWBOX_HEIGHT - height;
        const isActive = activeIndex === index;
        const label = pointLabels?.[index];

        function activate() {
          setActiveIndex(index);
          onHover({
            xPercent: x + barWidth / 2,
            yPercent: (y / VIEWBOX_HEIGHT) * 100,
            text: tooltipText(label, value, unit),
          });
        }

        function deactivate() {
          setActiveIndex(null);
          onHover(null);
        }

        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={barWidth}
            height={height}
            rx={3}
            fill={color}
            opacity={isActive ? 0.75 : 1}
            tabIndex={0}
            data-testid="chart-bar-hit"
            aria-label={tooltipText(label, value, unit)}
            onMouseEnter={activate}
            onMouseLeave={deactivate}
            onFocus={activate}
            onBlur={deactivate}
          />
        );
      })}
    </svg>
  );
}

/** Min/max pra escala lateral (eixo Y). `bar`: baseline sempre 0. `line`: união de todos os pontos de todas as séries (ver docstring do componente — no app real é sempre 1 série só). */
function computeAxisRange(series: ChartSeries[], variant: ChartCardVariant): { min: number; max: number } | null {
  if (variant === "bar") {
    const points = series[0]?.points ?? [];
    if (points.length === 0) {
      return null;
    }
    return { min: 0, max: Math.max(...points, 0) };
  }

  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) {
    return null;
  }
  return { min: Math.min(...allPoints), max: Math.max(...allPoints) };
}

export function ChartCard({ title, variant, series, xLabels, pointLabels, unit = "", className = "" }: ChartCardProps) {
  const empty = isEmptySeries(series, variant);
  const barSeries = series[0];
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const axisRange = empty ? null : computeAxisRange(series, variant);

  return (
    <Card
      padding="none"
      data-testid="chartcard"
      className={`flex flex-col gap-3 p-[12px_14px] md:p-5 ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {variant === "line" && !empty ? (
          <ul className="flex items-center gap-3">
            {series.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {empty ? (
        <EmptyState
          title="Nenhum dado no período"
          description="Ajuste o intervalo de datas ou os sensores selecionados"
        />
      ) : (
        <>
          <div className="flex gap-2">
            {axisRange ? (
              <div
                data-testid="chart-axis"
                className="flex w-9 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] leading-none text-text-faint"
              >
                <span>
                  {formatValue(axisRange.max)}
                  {unit}
                </span>
                <span>
                  {formatValue(axisRange.min)}
                  {unit}
                </span>
              </div>
            ) : null}
            <div className="relative min-w-0 flex-1">
              {variant === "line" ? (
                <LineChart series={series} pointLabels={pointLabels} unit={unit} onHover={setHover} />
              ) : (
                // `empty` já garante `series.length > 0` aqui — `barSeries` é
                // sempre definido neste ramo, mas o TS não infere essa relação
                // entre duas variáveis distintas. `!` documenta essa garantia em
                // vez de um fallback `??` que nunca seria de fato exercitado
                // (branch morta, inalcançável por construção).
                <BarChart
                  points={barSeries!.points}
                  color={barSeries!.color}
                  pointLabels={pointLabels}
                  unit={unit}
                  onHover={setHover}
                />
              )}
              {hover ? (
                <div
                  role="tooltip"
                  data-testid="chart-tooltip"
                  className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-md border border-border-default bg-surface-card px-2 py-1 text-[11px] font-medium text-text-primary shadow-lg"
                  style={{ left: `${Math.min(Math.max(hover.xPercent, 8), 92)}%`, top: `${hover.yPercent}%` }}
                >
                  {hover.text}
                </div>
              ) : null}
            </div>
          </div>
          {xLabels && xLabels.length > 0 ? (
            <div className="flex items-center justify-between text-[11px] text-text-faint">
              {xLabels.map((label, index) => (
                // Índice como key: xLabels é posicional (mapeia 1:1 com os
                // pontos do eixo X), não uma lista com identidade própria.
                <span key={index}>{label}</span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

export default ChartCard;
