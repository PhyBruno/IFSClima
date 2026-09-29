import type { LatestReading, Metric, Range, SeriesResponse } from "../api-client";
import { getUvCriticality, type UvCriticality } from "../utils/uvIndex";
import { ReportChart } from "./ReportChart";
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
  seriesToPoints,
  summarizeSeries,
  type MetricMeta,
} from "./reportData";

/**
 * Relatório em PDF do Painel de Monitoramento — o MESMO conteúdo do
 * dashboard (leitura mais recente + séries agregadas do período escolhido),
 * diagramado como documento em vez de screenshot da tela:
 *
 * - página 1: cabeçalho, cards das condições atuais (com a criticidade do
 *   UV), tabela-resumo do período (mín/média/máx e variação ou total de
 *   chuva) e o gráfico de temperatura em destaque;
 * - página 2: tendências de umidade, pressão, chuva (barras, acumulado por
 *   intervalo) e UV, com uma nota de leitura dos gráficos para uso em sala.
 */
export const DASHBOARD_REPORT_TITLE = "Relatório do Painel de Monitoramento";

export const RANGE_LABELS: Record<Range, string> = {
  "24h": "Últimas 24 horas",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

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
  range: Range;
  generatedAt: Date;
}

const TOTAL_PAGES = 2;

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
            const summary = summarizeSeries(series[meta.metric]);
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
                      <span className="text-[9px] font-normal text-slate-400">por intervalo</span>
                    ) : null}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-slate-600">
                  {formatMetricValue(summary.min, meta)}
                </td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900">
                  {formatMetricValue(summary.avg, meta)}
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

  return (
    <ReportCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MetricIcon meta={meta} size={14} />
          <div className="flex flex-col">
            <span className="text-[12px] font-semibold text-slate-900">{meta.label}</span>
            <span className="text-[9px] text-slate-400">
              {isRain ? "Acumulado por intervalo" : "Média por intervalo"}
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
        points={seriesToPoints(response)}
        color={meta.color}
        kind={isRain ? "bar" : "line"}
        width={width}
        height={height}
        digits={meta.digits}
        utcDays={response?.bucket === "day"}
      />
    </ReportCard>
  );
}

export function DashboardReport({ latest, series, range, generatedAt }: DashboardReportProps) {
  const halfWidth = (CONTENT_WIDTH_PX - 16) / 2 - 34;
  const bucketText =
    range === "30d" ? "cada ponto é a média de um dia" : "cada ponto é a média de uma hora";

  return (
    <>
      <ReportPage pageNumber={1} totalPages={TOTAL_PAGES} documentTitle={DASHBOARD_REPORT_TITLE}>
        <ReportHero
          eyebrow="IFSClima · Estação Meteorológica"
          title="Painel de Monitoramento"
          description="Condições mais recentes registradas pela estação e o comportamento de cada sensor no período selecionado."
          meta={[
            { label: "Estação", value: latest?.station_id ?? "main" },
            { label: "Período", value: RANGE_LABELS[range] },
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

        <ReportSection title="Resumo do período" hint={RANGE_LABELS[range]}>
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
          subtitle={`${RANGE_LABELS[range]} · gerado em ${formatDateTime(generatedAt)}`}
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
            mostram a agregação histórica do período ({bucketText}). Na chuva, cada barra é o volume
            acumulado no intervalo, e o total é a soma do período. O Índice UV segue a escala da
            OMS: 0–2 baixo, 3–5 moderado, 6–7 alto, 8–10 muito alto e 11+ extremo.
          </p>
        </ReportCard>
      </ReportPage>
    </>
  );
}

export default DashboardReport;
