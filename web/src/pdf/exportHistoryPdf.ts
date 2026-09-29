import { createElement } from "react";
import { getHistory, type HistoryReading } from "../api-client";
import { HISTORY_REPORT_TITLE, HistoryReport } from "./HistoryReport";
import { fileDateStamp } from "./reportData";
import { renderReportToPdf } from "./renderReportToPdf";

/**
 * Exporta o intervalo filtrado em `/historico` como relatório em PDF
 * (`HistoryPage` → botão "Exportar PDF", carregado por `import()`
 * dinâmico).
 *
 * A tabela da tela é paginada (50 por página), mas o relatório precisa do
 * intervalo INTEIRO para o resumo e os gráficos. Por isso as leituras são
 * buscadas em lotes do tamanho máximo aceito pela API (`MAX_PAGE_SIZE` de
 * `api/src/schemas/history.ts`), até `MAX_READINGS`. Esse teto evita dezenas
 * de requisições num intervalo de um ano. Quando é atingido, o relatório
 * informa que o resumo cobre só as leituras mais recentes.
 */
export const HISTORY_FETCH_PAGE_SIZE = 500;
export const MAX_READINGS = 5000;

export interface ExportHistoryPdfOptions {
  /** Intervalo já resolvido pelo servidor (o mesmo que a tabela está mostrando). */
  from?: string;
  to?: string;
  /** Só para testes determinísticos — default `new Date()`. */
  generatedAt?: Date;
}

export async function exportHistoryToPdf({
  from,
  to,
  generatedAt = new Date(),
}: ExportHistoryPdfOptions): Promise<void> {
  const readings: HistoryReading[] = [];
  let total = 0;
  let resolvedFrom = from ?? "";
  let resolvedTo = to ?? "";

  for (let page = 1; ; page += 1) {
    const response = await getHistory({
      from,
      to,
      page,
      pageSize: HISTORY_FETCH_PAGE_SIZE,
      order: "desc",
    });

    if (page === 1) {
      total = response.total;
      resolvedFrom = response.from;
      resolvedTo = response.to;
    }
    readings.push(...response.readings);

    const reachedEnd = response.readings.length < HISTORY_FETCH_PAGE_SIZE;
    if (reachedEnd || readings.length >= Math.min(total, MAX_READINGS)) {
      break;
    }
  }

  await renderReportToPdf(
    createElement(HistoryReport, {
      readings: readings.slice(0, MAX_READINGS),
      total,
      from: resolvedFrom,
      to: resolvedTo,
      generatedAt,
    }),
    {
      fileName: `ifsclima-historico-${fileDateStamp(generatedAt)}.pdf`,
      title: HISTORY_REPORT_TITLE,
    },
  );
}

export default exportHistoryToPdf;
