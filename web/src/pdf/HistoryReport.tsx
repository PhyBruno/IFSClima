import type { HistoryReading, Metric } from "../api-client";
import { tablePageCount } from "./drawReadingsTable";
import { ReportChart } from "./ReportChart";
import {
  CONTENT_WIDTH_PX,
  MetricIcon,
  ReportCard,
  ReportEmpty,
  ReportHero,
  ReportPage,
  ReportSection,
} from "./ReportLayout";
import {
  REPORT_METRICS,
  downsample,
  formatDateTime,
  formatMetricValue,
  formatNumber,
  getMetricMeta,
  readingsToPoints,
  summarizeRain,
  summarizeReadings,
  withGaps,
} from "./reportData";

/**
 * Relatório em PDF do Histórico: as leituras BRUTAS do intervalo filtrado
 * em `/historico`, diagramadas como documento.
 *
 * - página 1 (HTML capturado): cabeçalho com o intervalo e a contagem de
 *   leituras, um card de resumo por sensor e os gráficos de temperatura,
 *   umidade e pressão;
 * - páginas seguintes: a tabela com TODAS as leituras, desenhada em texto
 *   direto no PDF por `drawReadingsTable` (pedido do usuário, 2026-11-24 —
 *   antes a tabela parava em 560 linhas e a última folha estourava). Este
 *   componente só reserva a numeração ("Página 1 de N").
 *
 * Gráficos no eixo de tempo do INTERVALO pedido (`from`–`to`): um período sem
 * leituras aparece vazio, em vez de o eixo encolher até a última leitura.
 */
export const HISTORY_REPORT_TITLE = "Relatório de Histórico";
const CHART_MAX_POINTS = 240;

export interface HistoryReportProps {
  /** Leituras do intervalo (qualquer ordem). */
  readings: HistoryReading[];
  from: string;
  to: string;
  generatedAt: Date;
}

function SummaryCard({ metric, readings }: { metric: Metric; readings: HistoryReading[] }) {
  const meta = getMetricMeta(metric);
  const isRain = metric === "rain_mm";
  const summary = summarizeReadings(readings, metric);
  const rain = isRain ? summarizeRain(readings) : null;

  return (
    <ReportCard className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <MetricIcon meta={meta} size={13} />
        <span className="text-[10px] font-medium text-slate-500">{meta.label}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] text-slate-400">{rain ? "Total no período" : "Média"}</span>
        <span className="flex items-baseline gap-1 whitespace-nowrap text-slate-900">
          <span className="text-[18px] leading-tight font-semibold">
            {formatNumber(rain ? rain.total : summary.avg, meta.digits)}
          </span>
          {meta.unit ? <span className="text-[10px] text-slate-500">{meta.unit}</span> : null}
        </span>
      </div>
      {rain ? (
        // Chuva: mín/máx por leitura não fazem sentido físico (cada leitura
        // cobre um intervalo diferente) — intensidade máxima em 1 h e dias
        // com chuva descrevem o período.
        <div className="flex flex-col gap-0.5 border-t border-slate-100 pt-1.5 text-[9px] text-slate-500">
          <span>máx em 1 h: {formatMetricValue(rain.maxHourly, meta)}</span>
          <span>
            {rain.rainyDays} {rain.rainyDays === 1 ? "dia" : "dias"} com chuva
          </span>
        </div>
      ) : (
        <div className="flex justify-between border-t border-slate-100 pt-1.5 text-[9px] text-slate-500">
          <span>mín {formatNumber(summary.min, meta.digits)}</span>
          <span>máx {formatNumber(summary.max, meta.digits)}</span>
        </div>
      )}
    </ReportCard>
  );
}

function ChartCard({
  metric,
  readings,
  domain,
  width,
  height,
}: {
  metric: Metric;
  readings: HistoryReading[];
  domain: readonly [number, number] | undefined;
  width: number;
  height: number;
}) {
  const meta = getMetricMeta(metric);
  const points = withGaps(downsample(readingsToPoints(readings, metric), CHART_MAX_POINTS));

  return (
    <ReportCard className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <MetricIcon meta={meta} size={14} />
        <span className="text-[12px] font-semibold text-slate-900">
          {meta.label}
          {meta.unit ? <span className="font-normal text-slate-400"> ({meta.unit})</span> : null}
        </span>
      </div>
      <ReportChart
        series={[{ points, color: meta.color, digits: meta.digits, bounds: meta.bounds }]}
        domain={domain}
        width={width}
        height={height}
      />
    </ReportCard>
  );
}

/** Janela do eixo de tempo: o intervalo pedido (`from`/`to`). */
function intervalDomain(from: string, to: string): [number, number] | undefined {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : undefined;
}

export function HistoryReport({ readings, from, to, generatedAt }: HistoryReportProps) {
  const totalPages = 1 + tablePageCount(readings.length);
  const period = `${formatDateTime(from)} – ${formatDateTime(to)}`;
  const domain = intervalDomain(from, to);
  const fullWidth = CONTENT_WIDTH_PX - 34;
  const halfWidth = (CONTENT_WIDTH_PX - 16) / 2 - 34;

  return (
    <ReportPage pageNumber={1} totalPages={totalPages} documentTitle={HISTORY_REPORT_TITLE}>
      <ReportHero
        eyebrow="IFSClima · Estação Meteorológica"
        title="Histórico de Leituras"
        description="Leituras brutas registradas pela estação no intervalo filtrado, com o resumo estatístico e a evolução de cada sensor."
        meta={[
          { label: "Início", value: formatDateTime(from) },
          { label: "Fim", value: formatDateTime(to) },
          { label: "Leituras", value: formatNumber(readings.length, 0) },
          { label: "Gerado em", value: formatDateTime(generatedAt) },
        ]}
      />

      {readings.length === 0 ? (
        <ReportEmpty
          title="Nenhuma leitura no intervalo"
          description={`A estação não registrou dados entre ${period}.`}
        />
      ) : (
        <>
          <ReportSection
            title="Resumo estatístico"
            hint="Calculado sobre todas as leituras do intervalo"
          >
            <div className="grid grid-cols-5 gap-3">
              {REPORT_METRICS.map((meta) => (
                <SummaryCard key={meta.metric} metric={meta.metric} readings={readings} />
              ))}
            </div>
          </ReportSection>

          <ReportSection title="Evolução no intervalo" hint={period}>
            <ChartCard
              metric="temperature_c"
              readings={readings}
              domain={domain}
              width={fullWidth}
              height={200}
            />
            <div className="grid grid-cols-2 gap-4">
              <ChartCard
                metric="humidity_pct"
                readings={readings}
                domain={domain}
                width={halfWidth}
                height={170}
              />
              <ChartCard
                metric="pressure_hpa"
                readings={readings}
                domain={domain}
                width={halfWidth}
                height={170}
              />
            </div>
          </ReportSection>
        </>
      )}
    </ReportPage>
  );
}

export default HistoryReport;
