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
 *   pelo seu próprio min/max (não uma escala global compartilhada). Como o
 *   ChartCard não desenha eixo Y/grid (§5.2: "sem grid/eixo Y"), a escala
 *   absoluta não é comunicada visualmente de qualquer forma — normalizar por
 *   série garante que cada série ocupe a altura disponível mesmo quando as
 *   unidades divergem (ex. temperatura ~20-30 vs. umidade ~40-90%), que é o
 *   comportamento mais visível de um "sparkline duplo" sem eixo.
 *
 * - **Barras usam baseline 0, não min/max**: diferente da linha, o
 *   `variant="bar"` normaliza contra `[0, max]` — dado que o único caso
 *   observado (chuva acumulada) é uma grandeza que não é negativa, uma
 *   barra com baseline no mínimo da série distorceria a leitura visual
 *   ("chuva zero" pareceria uma barra do mesmo tamanho que qualquer outra
 *   se todos os valores fossem próximos e o baseline fosse o mínimo).
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
 *   sparkline do `StatCard`, sem crash).
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
  /** Labels do eixo X (ex. horários), renderizados abaixo do SVG. */
  xLabels?: string[];
  className?: string;
}

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 40;

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

function LineChart({ series }: { series: ChartSeries[] }) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-20 w-full"
      aria-hidden="true"
      data-testid="chart-svg"
    >
      {series.map((s) => {
        // Menos de 2 pontos: não dá pra desenhar uma linha, pula esta série
        // (sem crash), igual à regra do sparkline do StatCard.
        if (s.points.length < 2) {
          return null;
        }

        const min = Math.min(...s.points);
        const max = Math.max(...s.points);
        const range = max - min || 1;
        const step = VIEWBOX_WIDTH / (s.points.length - 1);
        const coords = s.points
          .map((value, index) => {
            const x = index * step;
            const y = VIEWBOX_HEIGHT - ((value - min) / range) * VIEWBOX_HEIGHT;
            return `${x},${y}`;
          })
          .join(" ");

        return (
          <polyline
            key={s.label}
            points={coords}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

// Só renderizado quando `isEmptySeries` (variant="bar") já confirmou
// `points.length > 0` — não precisa de guarda própria contra array vazio.
function BarChart({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(...points, 0);
  const barGap = 4;
  const barWidth = (VIEWBOX_WIDTH - barGap * (points.length - 1)) / points.length;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-20 w-full"
      aria-hidden="true"
      data-testid="chart-svg"
    >
      {points.map((value, index) => {
        const height = max > 0 ? (value / max) * VIEWBOX_HEIGHT : 0;
        const x = index * (barWidth + barGap);
        const y = VIEWBOX_HEIGHT - height;
        return <rect key={index} x={x} y={y} width={barWidth} height={height} rx={3} fill={color} />;
      })}
    </svg>
  );
}

export function ChartCard({ title, variant, series, xLabels, className = "" }: ChartCardProps) {
  const empty = isEmptySeries(series, variant);
  const barSeries = series[0];

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
          {variant === "line" ? (
            <LineChart series={series} />
          ) : (
            // `empty` já garante `series.length > 0` aqui — `barSeries` é
            // sempre definido neste ramo, mas o TS não infere essa relação
            // entre duas variáveis distintas. `!` documenta essa garantia em
            // vez de um fallback `??` que nunca seria de fato exercitado
            // (branch morta, inalcançável por construção).
            <BarChart points={barSeries!.points} color={barSeries!.color} />
          )}
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
