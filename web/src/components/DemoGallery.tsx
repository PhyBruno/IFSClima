import type { ReactNode } from "react";
import { Card } from "./Card";
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

const PLACEHOLDER_ICON: ReactNode = (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={2} />
  </svg>
);

const SENSORS: Array<{ sensor: SensorType; label: string; value: number; unit: string }> = [
  { sensor: "temperature", label: "Temperatura", value: 24.7, unit: "°C" },
  { sensor: "humidity", label: "Umidade", value: 62, unit: "%" },
  { sensor: "pressure", label: "Pressão", value: 1013, unit: "hPa" },
  { sensor: "uv", label: "Índice UV", value: 5, unit: "" },
  { sensor: "rain", label: "Chuva", value: 3.2, unit: "mm" },
  { sensor: "wind", label: "Vento", value: 12, unit: "km/h" },
];

const LINE_SERIES: ChartSeries[] = [
  { label: "Temperatura", color: "#f97316", points: [21, 22, 24, 23, 25, 24.7] },
  { label: "Umidade", color: "#0ea5e9", points: [58, 60, 63, 61, 59, 62] },
];

const BAR_SERIES: ChartSeries[] = [
  { label: "Chuva", color: "#14b8a6", points: [0, 0.5, 3.2, 1.1, 0, 0.8] },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

export function DemoGallery() {
  return (
    <div className="min-h-screen bg-surface-page px-4 py-6 text-text-primary md:px-8 md:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Galeria de Componentes</h1>
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span>Modo escuro</span>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-col gap-10">
        <Section title="Card">
          <Card>Card padrão (padding md, sem sombra)</Card>
        </Section>

        <Section title="StatCard">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {SENSORS.map((item) => (
              <StatCard
                key={item.sensor}
                sensor={item.sensor}
                label={item.label}
                value={item.value}
                unit={item.unit}
                icon={PLACEHOLDER_ICON}
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
              icon={PLACEHOLDER_ICON}
              lastSeenText="Última leitura há 3h"
            />
          </div>
        </Section>

        <Section title="ChartCard">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <ChartCard
              title="Temperatura x Umidade (24h)"
              variant="line"
              series={LINE_SERIES}
              xLabels={["00:00", "12:00", "23:00"]}
            />
            <ChartCard title="Chuva acumulada (7d)" variant="bar" series={BAR_SERIES} />
            <ChartCard title="Sem dados no período" variant="line" series={[]} />
          </div>
        </Section>

        <Section title="PeriodSelector">
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

        <Section title="StatusPill">
          <div className="flex flex-wrap items-center gap-4">
            <StatusPill variant="card" online lastReadingAt="14:32" />
            <StatusPill variant="card" online={false} lastReadingAt="09:10" />
            <StatusPill variant="inline" online lastReadingAt="14:32" />
            <StatusPill variant="inline" online={false} lastReadingAt="09:10" />
          </div>
        </Section>

        <Section title="EmptyState">
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
