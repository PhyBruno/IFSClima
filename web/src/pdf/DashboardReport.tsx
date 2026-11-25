import type { HistoryReading, LatestReading, Metric, SeriesResponse } from "../api-client";
import { MS_PER_DAY, MS_PER_HOUR } from "../utils/timeAxis";
import { periodLabel, type Period } from "../utils/period";
import { getUvCriticality, type UvCriticality } from "../utils/uvIndex";
import { ReportChart, type ReportSeries } from "./ReportChart";
import {
  CONTENT_WIDTH_PX,
  MetricIcon,
  ReportCard,
  ReportContinuationHeader,
  ReportHero,
  ReportPage,
  ReportSection,
} from "./ReportLayout";
import {
  REPORT_METRICS,
  formatDateTime,
  formatMetricValue,
  formatNumber,
  getMetricMeta,
  readingsToPoints,
  sampleEvery,
  seriesToPoints,
  summarizeSeries,
  type MetricMeta,
} from "./reportData";

/**
 * Relatório em PDF do Painel de Monitoramento — o MESMO conteúdo do
 * dashboard (leitura mais recente + séries agregadas do período escolhido,
 * preset ou personalizado), diagramado como documento:
 *
 * - página 1: cabeçalho, condições atuais (com a criticidade do UV),
 *   tabela-resumo do período e o gráfico de temperatura em destaque;
 * - página 2: tendências de umidade, pressão, chuva (barras por hora/dia) e
 *   UV, com uma nota de leitura dos gráficos para uso em sala;
 * - página 3: "Comparativos" (pedido do usuário, 2026-11-24) — os 3 pares de
 *   grandezas ao longo do tempo, médias em linhas e leituras em pontos.
 *
 * Todos os gráficos usam o eixo de tempo da janela consultada
 * (`SeriesResponse.from/to`), como na tela.
 */
export const DASHBOARD_REPORT_TITLE = "Relatório do Painel de Monitoramento";

const UV_LEVEL_COLORS: Record<UvCriticality, { fg: string; bg: string }> = {
  low: { fg: "#15803d", bg: "#dcfce7" },
  moderate: { fg: "#a16207", bg: "#fef9c3" },
  high: { fg: "#c2410c", bg: "#ffedd5" },
  "very-high": { fg: "#b91c1c", bg: "#fee2e2" },
  extreme: { fg: "#7e22ce", bg: "#f3e8ff" },
};

export interface DashboardReportProps {
  latest: LatestReading | undefined;
  series: Partial<Record<Metric, SeriesResponse>>;
  period: Period;
  /** Leituras brutas da janela (gráficos de pontos dos comparativos). */
  readings?: HistoryReading[];
  generatedAt: Date;
}

const TOTAL_PAGES = 3;

/** Teto de pontos por série nos gráficos de leituras (o SVG vira imagem na captura). */
const REPORT_MAX_DOTS = 1500;

/** Os 3 pares dos comparativos — mesmos da tela (`ChartsSection.COMPARISON_PAIRS`). */
export const REPORT_COMPARISON_PAIRS: [Metric, Metric][] = [
  ["temperature_c", "humidity_pct"],
  ["temperature_c", "pressure_hpa"],
  ["humidity_pct", "pressure_hpa"],
];

function windowOf(response: SeriesResponse | undefined): [number, number] | undefined {
  if (!response) {
    return undefined;
  }
  const from = Date.parse(response.from);
  const to = Date.parse(response.to);
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? [from, to] : undefined;
}

/** "hora" ou "dia" — o que cada ponto/barra agregada representa. */
function bucketNoun(response: SeriesResponse | undefined): "hora" | "dia" {
  return response?.bucket === "day" ? "dia" : "hora";
}

function CurrentCard({ meta, value }: { meta: MetricMeta; value: number | null | undefined }) {
  const uv =
    meta.metric === "uv_index" && typeof value === "number" ? getUvCriticality(value) : null;

  return (
    <ReportCard className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <MetricIcon meta={meta} />
        {uv ? (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={{
              color: UV_LEVEL_COLORS[uv.level].fg,
              backgroundColor: UV_LEVEL_COLORS[uv.level].bg,
            }}
          >
            {uv.label}
          </span>
        ) : null}
      </div>
      <span className="text-[10px] font-medium text-slate-500">{meta.label}</span>
      {typeof value === "number" ? (
        <span className="flex items-baseline gap-1 whitespace-nowrap text-slate-900">
          <span className="text-[20px] leading-none font-semibold">
            {formatNumber(value, meta.digits)}
          </span>
          {meta.unit ? <span className="text-[11px] text-slate-500">{meta.unit}</span> : null}
        </span>
      ) : (
        <span className="text-[16px] leading-none font-semibold text-slate-400">Sem sinal</span>
      )}
    </ReportCard>
  );
}

function SummaryTable({ series }: { series: DashboardReportProps["series"] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-slate-50 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
            <th className="px-4 py-2.5 text-left">Sensor</th>
            <th className="px-4 py-2.5 text-right">Mínima</th>
            <th className="px-4 py-2.5 text-right">Média</th>
            <th className="px-4 py-2.5 text-right">Máxima</th>
            <th className="px-4 py-2.5 text-right">Variação / total</th>
          </tr>
        </thead>
        <tbody>
          {REPORT_METRICS.map((meta) => {
            const response = series[meta.metric];
            const summary = summarizeSeries(response);
            const isRain = meta.metric === "rain_mm";
            const spread =
              summary.min !== null && summary.max !== null ? summary.max - summary.min : null;
            return (
              <tr key={meta.metric} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2.5 font-medium text-slate-800">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: meta.color }}
                      aria-hidden="true"
                    />
                    {meta.label}
                    {isRain ? (
                      <span className="text-[9px] font-normal text-slate-400">
                        máxima em 1 {bucketNoun(response)}
                      </span>
                    ) : null}
                  </span>
                </td>
                {/* Chuva: mínima/média de volumes por intervalo não descrevem nada
                    físico — só o maior volume num intervalo e o total. */}
                <td className="px-4 py-2 text-right text-slate-600">
                  {isRain ? "—" : formatMetricValue(summary.min, meta)}
                </td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900">
                  {isRain ? "—" : formatMetricValue(summary.avg, meta)}
                </td>
                <td className="px-4 py-2 text-right text-slate-600">
                  {formatMetricValue(summary.max, meta)}
                </td>
                <td className="px-4 py-2 text-right text-slate-600">
                  {isRain
                    ? `Total ${formatMetricValue(summary.total, meta)}`
                    : formatMetricValue(spread, meta)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrendCard({
  metric,
  response,
  width,
  height,
}: {
  metric: Metric;
  response: SeriesResponse | undefined;
  width: number;
  height: number;
}) {
  const meta = getMetricMeta(metric);
  const summary = summarizeSeries(response);
  const isRain = metric === "rain_mm";
  const noun = bucketNoun(response);

  return (
    <ReportCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MetricIcon meta={meta} size={14} />
          <div className="flex flex-col">
            <span className="text-[12px] font-semibold text-slate-900">{meta.label}</span>
            <span className="text-[9px] text-slate-400">
              {isRain ? `Volume por ${noun}` : `Média por ${noun}`}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-slate-400">{isRain ? "Total" : "Média"}</span>
          <span className="text-[13px] font-semibold text-slate-900">
            {formatMetricValue(isRain ? summary.total : summary.avg, meta)}
          </span>
        </div>
      </div>
      <ReportChart
        series={[
          {
            points: seriesToPoints(response),
            color: meta.color,
            digits: meta.digits,
            bounds: meta.bounds,
          },
        ]}
        kind={isRain ? "bar" : "line"}
        domain={windowOf(response)}
        bucketMs={response?.bucket === "day" ? MS_PER_DAY : MS_PER_HOUR}
        width={width}
        height={height}
      />
    </ReportCard>
  );
}

function PairLegend({ metrics }: { metrics: [Metric, Metric] }) {
  return (
    <div className="flex items-center gap-3 text-[9px] text-slate-500">
      {metrics.map((metric) => {
        const meta = getMetricMeta(metric);
        return (
          <span key={metric} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: meta.color }}
              aria-hidden="true"
            />
            {meta.label}
            {meta.unit ? ` (${meta.unit})` : ""}
          </span>
        );
      })}
    </div>
  );
}

function PairCard({
  metrics,
  kind,
  series,
  domain,
  width,
}: {
  metrics: [Metric, Metric];
  kind: "line" | "dots";
  series: ReportSeries[];
  domain: [number, number] | undefined;
  width: number;
}) {
  const title = metrics.map((metric) => getMetricMeta(metric).label).join(" e ");
  return (
    <ReportCard className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-900">{title}</span>
        <PairLegend metrics={metrics} />
      </div>
      <ReportChart series={series} kind={kind} domain={domain} width={width} height={200} />
    </ReportCard>
  );
}

function pairSeries(
  metrics: [Metric, Metric],
  pointsOf: (metric: Metric) => ReportSeries["points"],
): ReportSeries[] {
  return metrics.map((metric) => {
    const meta = getMetricMeta(metric);
    return {
      points: pointsOf(metric),
      color: meta.color,
      digits: meta.digits,
      unit: meta.unit,
      bounds: meta.bounds,
    };
  });
}

export function DashboardReport({
  latest,
  series,
  period,
  readings = [],
  generatedAt,
}: DashboardReportProps) {
  const halfWidth = (CONTENT_WIDTH_PX - 16) / 2 - 34;
  const label = periodLabel(period, "long");
  const bucketText =
    series.temperature_c?.bucket === "day"
      ? "cada ponto é a média de um dia"
      : "cada ponto é a média de uma hora";
  const domain = windowOf(series.temperature_c);

  return (
    <>
      <ReportPage pageNumber={1} totalPages={TOTAL_PAGES} documentTitle={DASHBOARD_REPORT_TITLE}>
        <ReportHero
          eyebrow="IFSClima · Estação Meteorológica"
          title="Painel de Monitoramento"
          description="Condições mais recentes registradas pela estação e o comportamento de cada sensor no período selecionado."
          meta={[
            { label: "Estação", value: latest?.station_id ?? "main" },
            { label: "Período", value: label },
            { label: "Última leitura", value: formatDateTime(latest?.timestamp) },
            { label: "Gerado em", value: formatDateTime(generatedAt) },
          ]}
        />

        <ReportSection title="Condições atuais" hint="Leitura mais recente enviada pela estação">
          <div className="grid grid-cols-5 gap-3">
            {REPORT_METRICS.map((meta) => (
              <CurrentCard key={meta.metric} meta={meta} value={latest?.[meta.metric]} />
            ))}
          </div>
        </ReportSection>

        <ReportSection title="Resumo do período" hint={label}>
          <SummaryTable series={series} />
        </ReportSection>

        <ReportSection title="Temperatura no período" hint={bucketText}>
          <TrendCard
            metric="temperature_c"
            response={series.temperature_c}
            width={CONTENT_WIDTH_PX - 34}
            height={190}
          />
        </ReportSection>
      </ReportPage>

      <ReportPage pageNumber={2} totalPages={TOTAL_PAGES} documentTitle={DASHBOARD_REPORT_TITLE}>
        <ReportContinuationHeader
          title="Tendências do período"
          subtitle={`${label} · gerado em ${formatDateTime(generatedAt)}`}
        />

        <div className="grid grid-cols-2 gap-4">
          {(["humidity_pct", "pressure_hpa", "rain_mm", "uv_index"] as const).map((metric) => (
            <TrendCard
              key={metric}
              metric={metric}
              response={series[metric]}
              width={halfWidth}
              height={250}
            />
          ))}
        </div>

        <ReportCard className="bg-slate-50">
          <p className="text-[10px] leading-relaxed text-slate-500">
            <strong className="font-semibold text-slate-700">Como ler os gráficos:</strong> os cards
            de “Condições atuais” mostram a leitura pontual mais recente. Os gráficos e o resumo
            mostram a agregação histórica do período ({bucketText}), posicionada no tempo real: um
            trecho vazio é um período sem leituras da estação, e as linhas tracejadas verticais
            marcam a meia-noite. Na chuva, cada barra é o volume acumulado na hora ou no dia, e o
            total é a soma do período. A umidade relativa vai de 0 a 100 %. O Índice UV segue a
            escala da OMS: 0–2 baixo, 3–5 moderado, 6–7 alto, 8–10 muito alto e 11+ extremo.
          </p>
        </ReportCard>
      </ReportPage>

      <ReportPage pageNumber={3} totalPages={TOTAL_PAGES} documentTitle={DASHBOARD_REPORT_TITLE}>
        <ReportContinuationHeader
          title="Comparativos"
          subtitle={`${label} · duas grandezas ao longo do tempo, cada uma no seu eixo`}
        />

        <div className="grid grid-cols-2 gap-4">
          {REPORT_COMPARISON_PAIRS.map((metrics) => [
            <PairCard
              key={`${metrics.join("-")}-line`}
              metrics={metrics}
              kind="line"
              series={pairSeries(metrics, (metric) => seriesToPoints(series[metric]))}
              domain={domain}
              width={halfWidth}
            />,
            <PairCard
              key={`${metrics.join("-")}-dots`}
              metrics={metrics}
              kind="dots"
              series={pairSeries(metrics, (metric) =>
                sampleEvery(readingsToPoints(readings, metric), REPORT_MAX_DOTS),
              )}
              domain={domain}
              width={halfWidth}
            />,
          ])}
        </div>
      </ReportPage>
    </>
  );
}

export default DashboardReport;
