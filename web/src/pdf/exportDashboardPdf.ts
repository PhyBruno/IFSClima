import { createElement } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { getLatest, getSeries, type Metric, type SeriesResponse } from "../api-client";
import { LATEST_QUERY_KEY } from "../hooks/useLatest";
import { seriesQueryKey } from "../hooks/useSeries";
import { DASHBOARD_REPORT_TITLE, DashboardReport } from "./DashboardReport";
import { REPORT_METRICS, fileDateStamp } from "./reportData";
import { renderReportToPdf } from "./renderReportToPdf";
import { periodToWindow, type Period } from "../utils/period";

/**
 * Exporta o Painel de Monitoramento como relatório em PDF (`DashboardPage`
 * → botão "Exportar PDF", carregado por `import()` dinâmico para não pesar
 * o bundle inicial).
 *
 * **Mesmos dados da tela, sem nova busca**: `ensureQueryData` devolve o que
 * já está no cache do React Query (mesmas `queryKey`s de `useLatest` e
 * `useSeries`), então o PDF traz exatamente os valores que o usuário está
 * vendo. Só busca na API o que ainda não estiver em cache.
 *
 * **Falha parcial não derruba o PDF**: se uma série falhar, o gráfico dela
 * sai como "Sem dados no período" e o resto do relatório é gerado. Só lança
 * (e a página mostra o erro) quando NADA pôde ser carregado.
 */
export interface ExportDashboardPdfOptions {
  queryClient: QueryClient;
  /** Período ativo em `ChartsSection` (`?range=`, ou `&from=&to=` no personalizado). */
  period: Period;
  /** Só para testes determinísticos — default `new Date()`. */
  generatedAt?: Date;
}

export async function exportDashboardToPdf({
  queryClient,
  period,
  generatedAt = new Date(),
}: ExportDashboardPdfOptions): Promise<void> {
  const seriesWindow = periodToWindow(period);
  const [latestResult, ...seriesResults] = await Promise.allSettled([
    queryClient.ensureQueryData({ queryKey: LATEST_QUERY_KEY, queryFn: getLatest }),
    ...REPORT_METRICS.map(({ metric }) =>
      queryClient.ensureQueryData({
        queryKey: seriesQueryKey(metric, seriesWindow),
        queryFn: () => getSeries(metric, seriesWindow),
      }),
    ),
  ]);

  const series: Partial<Record<Metric, SeriesResponse>> = {};
  seriesResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      series[REPORT_METRICS[index]!.metric] = result.value as SeriesResponse;
    }
  });

  const latest = latestResult.status === "fulfilled" ? latestResult.value : undefined;
  if (!latest && Object.keys(series).length === 0) {
    throw new Error("Não foi possível carregar os dados do painel");
  }

  await renderReportToPdf(createElement(DashboardReport, { latest, series, period, generatedAt }), {
    fileName: `ifsclima-painel-${period.range}-${fileDateStamp(generatedAt)}.pdf`,
    title: DASHBOARD_REPORT_TITLE,
  });
}

export default exportDashboardToPdf;
