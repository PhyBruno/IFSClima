import type { HistoryReading, Metric } from "../api-client";
import { ReportChart } from "./ReportChart";
import {
  CONTENT_WIDTH_PX,
  MetricIcon,
  ReportCard,
  ReportContinuationHeader,
  ReportEmpty,
  ReportHero,
  ReportPage,
  ReportSection,
} from "./ReportLayout";
import {
  REPORT_METRICS,
  downsample,
  formatDateTime,
  formatNumber,
  getMetricMeta,
  paginate,
  readingsToPoints,
  summarizeReadings,
} from "./reportData";

/**
 * Relatório em PDF do Histórico: as leituras BRUTAS do intervalo filtrado
 * em `/historico`, diagramadas como documento.
 *
 * - página 1: cabeçalho com o intervalo e a contagem de leituras, um card de
 *   resumo por sensor (média em destaque, mín/máx, e total na chuva) e os
 *   gráficos de temperatura, umidade e pressão;
 * - páginas seguintes: a tabela de leituras, `ROWS_PER_PAGE` linhas por
 *   folha, com cabeçalho repetido e numeração "Página X de Y".
 *
 * **Tabela limitada a `MAX_TABLE_ROWS`**: um intervalo longo pode ter
 * milhares de leituras, o que viraria centenas de páginas. O resumo e os
 * gráficos usam TODAS as leituras recebidas. A tabela mostra só as mais
 * recentes e avisa quantas ficaram de fora, apontando para o CSV/XLSX, que
 * continuam sendo o formato para o conjunto completo.
 */
export const HISTORY_REPORT_TITLE = "Relatório de Histórico";
export const ROWS_PER_PAGE = 40;
export const MAX_TABLE_ROWS = ROWS_PER_PAGE * 14;
const CHART_MAX_POINTS = 240;

export interface HistoryReportProps {
  /** Leituras recebidas da API, na ordem da API (mais recente primeiro). */
  readings: HistoryReading[];
  /** Total de leituras do intervalo segundo a API (pode ser maior que `readings.length`). */
  total: number;
  from: string;
  to: string;
  generatedAt: Date;
}

function SummaryCard({ metric, readings }: { metric: Metric; readings: HistoryReading[] }) {
  const meta = getMetricMeta(metric);
  const summary = summarizeReadings(readings, metric);
  const isRain = metric === "rain_mm";

  return (
    <ReportCard className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <MetricIcon meta={meta} size={13} />
        <span className="text-[10px] font-medium text-slate-500">{meta.label}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] text-slate-400">{isRain ? "Total" : "Média"}</span>
        <span className="flex items-baseline gap-1 whitespace-nowrap text-slate-900">
          <span className="text-[18px] leading-tight font-semibold">
            {formatNumber(isRain ? summary.total : summary.avg, meta.digits)}
          </span>
          {meta.unit ? <span className="text-[10px] text-slate-500">{meta.unit}</span> : null}
        </span>
      </div>
      <div className="flex justify-between border-t border-slate-100 pt-1.5 text-[9px] text-slate-500">
        <span>mín {formatNumber(summary.min, meta.digits)}</span>
        <span>máx {formatNumber(summary.max, meta.digits)}</span>
      </div>
    </ReportCard>
  );
}

function ChartCard({
  metric,
  readings,
  width,
  height,
}: {
  metric: Metric;
  readings: HistoryReading[];
  width: number;
  height: number;
}) {
  const meta = getMetricMeta(metric);
  const points = downsample(readingsToPoints(readings, metric), CHART_MAX_POINTS);

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
        points={points}
        color={meta.color}
        width={width}
        height={height}
        digits={meta.digits}
      />
    </ReportCard>
  );
}

function ReadingsTable({ rows, startIndex }: { rows: HistoryReading[]; startIndex: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-slate-50 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
            <th className="w-10 px-3 py-2 text-right">#</th>
            <th className="px-3 py-2 text-left">Data e hora</th>
            {REPORT_METRICS.map((meta) => (
              <th key={meta.metric} className="px-3 py-2 text-right">
                {meta.label}
                {meta.unit ? <span className="normal-case"> ({meta.unit})</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((reading, index) => (
            <tr
              key={reading.timestamp}
              className={index % 2 === 1 ? "bg-slate-50/70" : undefined}
              style={{ height: 22 }}
            >
              <td className="px-3 text-right text-slate-400">{startIndex + index + 1}</td>
              <td className="px-3 font-medium text-slate-700">
                {formatDateTime(reading.timestamp)}
              </td>
              {REPORT_METRICS.map((meta) => (
                <td key={meta.metric} className="px-3 text-right text-slate-600">
                  {formatNumber(reading[meta.metric], meta.digits)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistoryReport({ readings, total, from, to, generatedAt }: HistoryReportProps) {
  const tableRows = readings.slice(0, MAX_TABLE_ROWS);
  const tablePages = readings.length === 0 ? [] : paginate(tableRows, ROWS_PER_PAGE, ROWS_PER_PAGE);
  const totalPages = 1 + tablePages.length;
  const omitted = total - tableRows.length;
  const period = `${formatDateTime(from)} – ${formatDateTime(to)}`;
  const fullWidth = CONTENT_WIDTH_PX - 34;
  const halfWidth = (CONTENT_WIDTH_PX - 16) / 2 - 34;
  const statsNote =
    readings.length < total
      ? `Resumo e gráficos calculados sobre as ${formatNumber(readings.length, 0)} leituras mais recentes`
      : "Calculado sobre todas as leituras do intervalo";

  return (
    <>
      <ReportPage pageNumber={1} totalPages={totalPages} documentTitle={HISTORY_REPORT_TITLE}>
        <ReportHero
          eyebrow="IFSClima · Estação Meteorológica"
          title="Histórico de Leituras"
          description="Leituras brutas registradas pela estação no intervalo filtrado, com o resumo estatístico e a evolução de cada sensor."
          meta={[
            { label: "Início", value: formatDateTime(from) },
            { label: "Fim", value: formatDateTime(to) },
            { label: "Leituras", value: formatNumber(total, 0) },
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
            <ReportSection title="Resumo estatístico" hint={statsNote}>
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
                width={fullWidth}
                height={200}
              />
              <div className="grid grid-cols-2 gap-4">
                <ChartCard
                  metric="humidity_pct"
                  readings={readings}
                  width={halfWidth}
                  height={170}
                />
                <ChartCard
                  metric="pressure_hpa"
                  readings={readings}
                  width={halfWidth}
                  height={170}
                />
              </div>
            </ReportSection>
          </>
        )}
      </ReportPage>

      {tablePages.map((rows, pageIndex) => {
        const startIndex = pageIndex * ROWS_PER_PAGE;
        const isLast = pageIndex === tablePages.length - 1;
        return (
          <ReportPage
            key={startIndex}
            pageNumber={pageIndex + 2}
            totalPages={totalPages}
            documentTitle={HISTORY_REPORT_TITLE}
          >
            <ReportContinuationHeader
              title="Leituras registradas"
              subtitle={`${period} · leituras ${startIndex + 1}–${startIndex + rows.length} de ${formatNumber(total, 0)}`}
            />
            <ReadingsTable rows={rows} startIndex={startIndex} />
            {isLast && omitted > 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                A tabela mostra as {formatNumber(tableRows.length, 0)} leituras mais recentes.{" "}
                {formatNumber(omitted, 0)} leituras mais antigas ficaram de fora. Use “Exportar CSV”
                ou “Exportar XLSX” para o conjunto completo.
              </p>
            ) : null}
          </ReportPage>
        );
      })}
    </>
  );
}

export default HistoryReport;
