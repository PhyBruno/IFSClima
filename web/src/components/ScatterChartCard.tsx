import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { formatValue, paddedDomain } from "./ChartCard";

/**
 * `ScatterChartCard` — gráfico de dispersão (uma grandeza EM FUNÇÃO da
 * outra), pedido do usuário, 2026-10-02: "Temperatura × Umidade" e
 * "Temperatura × Pressão" com a temperatura no eixo Y e a outra grandeza no
 * eixo X. Diferente do `ChartCard` (séries ao longo do TEMPO), aqui cada
 * ponto é um bucket em que as duas métricas têm valor — o tempo só aparece
 * no tooltip (`ScatterPoint.label`). Mesmo invólucro visual do `ChartCard`
 * (Card, título, altura, `EmptyState`) pra os dois tipos conviverem no grid.
 */
export interface ScatterPoint {
  x: number;
  y: number;
  /** Rótulo de tempo do bucket de origem, exibido como título do tooltip. */
  label: string;
}

export interface ScatterAxisConfig {
  label: string;
  unit: string;
}

export interface ScatterChartCardProps {
  title: string;
  points: ScatterPoint[];
  xAxis: ScatterAxisConfig;
  yAxis: ScatterAxisConfig;
  /** Cor CSS literal dos pontos. */
  color: string;
  className?: string;
}

function TooltipRow({ name, value, unit }: { name: string; value: number; unit: string }) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className="text-muted-foreground">{name}</span>
      <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
        {formatValue(value)}
        {unit}
      </span>
    </div>
  );
}

export function ScatterChartCard({
  title,
  points,
  xAxis,
  yAxis,
  color,
  className,
}: ScatterChartCardProps) {
  const empty = points.length === 0;
  const config: ChartConfig = { points: { label: title, color } };

  return (
    <Card
      data-testid="scatterchartcard"
      size="sm"
      className={cn("md:[--card-spacing:--spacing(5)]", className)}
    >
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          <h3>{title}</h3>
        </CardTitle>
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
            role="img"
            aria-label={`Gráfico de dispersão: ${title} (${yAxis.label} no eixo Y, ${xAxis.label} no eixo X)`}
            className="aspect-auto h-36 w-full"
          >
            <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid />
              <XAxis
                type="number"
                dataKey="x"
                name={xAxis.label}
                domain={paddedDomain}
                tickFormatter={(value: number) => `${formatValue(value)}${xAxis.unit}`}
                tickLine={false}
                axisLine={false}
                tickCount={4}
                height={20}
                fontSize={10}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yAxis.label}
                domain={paddedDomain}
                tickFormatter={(value: number) => `${formatValue(value)}${yAxis.unit}`}
                tickLine={false}
                axisLine={false}
                tickCount={3}
                width={44}
                fontSize={10}
              />
              <ChartTooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as ScatterPoint | undefined;
                  if (!active || !point) {
                    return null;
                  }
                  return (
                    <div className="grid min-w-32 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <div className="font-medium">{point.label}</div>
                      <TooltipRow name={yAxis.label} value={point.y} unit={yAxis.unit} />
                      <TooltipRow name={xAxis.label} value={point.x} unit={xAxis.unit} />
                    </div>
                  );
                }}
              />
              <Scatter
                data={points}
                fill="var(--color-points)"
                // Contorno da cor do fundo do card: pontos quase sobrepostos
                // aparecem como círculos separados, não um borrão (pedido do
                // usuário, 2026-10-02).
                stroke="var(--card)"
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </ScatterChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default ScatterChartCard;
