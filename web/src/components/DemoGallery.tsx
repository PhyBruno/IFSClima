import type { ReactNode } from "react";
import {
  CloudRainIcon,
  DropletsIcon,
  GaugeIcon,
  SunIcon,
  ThermometerIcon,
  WindIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, type SensorType } from "./StatCard";
import { ChartCard, type ChartSeries } from "./ChartCard";
import { PeriodSelector } from "./PeriodSelector";
import { StatusPill } from "./StatusPill";
import { EmptyState } from "./EmptyState";
import { ThemeToggle } from "./ThemeToggle";

/**
 * `/__ui` — galeria de componentes (T5.4, docs/design-extraction.md).
 *
 * Único propósito: colocar uma instância de cada componente base/composto de
 * T5.3 lado a lado (incluindo variantes/estados-chave: nulo, vazio, online/
 * offline, line/bar) para comparação visual manual com o HTML de design
 * original. Não consome a API (isso é F6) — todo dado aqui é fixo/de exemplo.
 *
 * Ícones: o inventário de ícones reais por sensor não foi extraído em T5.1/
 * T5.1b (só cores/estrutura o foram) — fora do escopo desta tarefa inventar
 * um set novo. Usa-se aqui um placeholder mínimo (círculo) compartilhado por
 * todo sensor, só para satisfazer a prop obrigatória `icon` do `StatCard`.
 */

const SENSOR_ICONS: Record<SensorType, ReactNode> = {
  temperature: <ThermometerIcon aria-hidden="true" />,
  humidity: <DropletsIcon aria-hidden="true" />,
  pressure: <GaugeIcon aria-hidden="true" />,
  uv: <SunIcon aria-hidden="true" />,
  rain: <CloudRainIcon aria-hidden="true" />,
  wind: <WindIcon aria-hidden="true" />,
};

const SENSORS: Array<{ sensor: SensorType; label: string; value: number; unit: string }> = [
  { sensor: "temperature", label: "Temperatura", value: 24.7, unit: "°C" },
  { sensor: "humidity", label: "Umidade", value: 62, unit: "%" },
  { sensor: "pressure", label: "Pressão", value: 1013, unit: "hPa" },
  { sensor: "uv", label: "Índice UV", value: 5, unit: "" },
  { sensor: "rain", label: "Chuva", value: 3.2, unit: "mm" },
  { sensor: "wind", label: "Vento", value: 12, unit: "km/h" },
];

const LINE_SERIES: ChartSeries[] = [
  {
    label: "Temperatura",
    color: "var(--sensor-temperature)",
    points: [21, 22, 24, 23, 25, 24.7],
    unit: "°C",
  },
  {
    label: "Umidade",
    color: "var(--sensor-humidity)",
    points: [58, 60, 63, 61, 59, 62],
    unit: "%",
  },
];

const BAR_SERIES: ChartSeries[] = [
  { label: "Chuva", color: "var(--sensor-rain)", points: [0, 0.5, 3.2, 1.1, 0, 0.8], unit: "mm" },
];

function Section({
  title,
  component,
  children,
}: {
  title: string;
  component: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        {/* Nome técnico do componente exibido como símbolo de código (não é
            prosa em inglês) — mantém a utilidade da galeria de comparação sem
            deixar o título de seção em inglês puro. */}
        <code className="font-mono text-xs text-muted-foreground">{`<${component} />`}</code>
      </div>
      {children}
    </section>
  );
}

export function DemoGallery() {
  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground md:px-8 md:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Galeria de Componentes
        </h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Modo escuro</span>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-col gap-10">
        <Section title="Cartão base" component="Card">
          <Card className="max-w-sm">
            <CardHeader>
              <CardTitle>Cartão padrão</CardTitle>
              <CardDescription>Base de todos os cards do painel (shadcn/ui).</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground">Conteúdo do cartão.</CardContent>
          </Card>
        </Section>

        <Section title="Cartão de sensor" component="StatCard">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {SENSORS.map((item) => (
              <StatCard
                key={item.sensor}
                sensor={item.sensor}
                label={item.label}
                value={item.value}
                unit={item.unit}
                icon={SENSOR_ICONS[item.sensor]}
                trend="up"
                deltaText="+0.4"
                sparklinePoints={[1, 3, 2, 4, 3, 5]}
              />
            ))}
            <StatCard
              sensor="wind"
              label="Vento"
              value={null}
              unit="km/h"
              icon={SENSOR_ICONS.wind}
              lastSeenText="Última leitura há 3h"
            />
          </div>
        </Section>

        <Section title="Cartão de gráfico" component="ChartCard">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <ChartCard
              title="Temperatura x Umidade (24h)"
              variant="line"
              series={LINE_SERIES}
              xLabels={["00:00", "12:00", "23:00"]}
            />
            <ChartCard title="Chuva acumulada (7d)" variant="bar" series={BAR_SERIES} unit="mm" />
            <ChartCard title="Sem dados no período" variant="line" series={[]} />
          </div>
        </Section>

        <Section title="Seletor de período" component="PeriodSelector">
          <div className="flex flex-col gap-3">
            <PeriodSelector
              options={[
                { value: "24h", label: "Últimas 24h" },
                { value: "7d", label: "7 dias" },
                { value: "30d", label: "30 dias" },
              ]}
              value="24h"
              onChange={() => {}}
            />
            <PeriodSelector mode="dropdown" label="Últimas 24h" />
          </div>
        </Section>

        <Section title="Indicador de status" component="StatusPill">
          <div className="flex flex-wrap items-center gap-4">
            <StatusPill variant="card" online lastReadingAt="14:32" />
            <StatusPill variant="card" online={false} lastReadingAt="09:10" />
            <StatusPill variant="inline" online lastReadingAt="14:32" />
            <StatusPill variant="inline" online={false} lastReadingAt="09:10" />
          </div>
        </Section>

        <Section title="Estado vazio" component="EmptyState">
          <EmptyState
            title="Nenhum dado no período"
            description="Ajuste o intervalo de datas ou os sensores selecionados"
          />
        </Section>
      </div>
    </div>
  );
}

export default DemoGallery;
