import { createElement } from "react";
import { fetchAllReadings } from "../api-client";
import { drawReadingsTable } from "./drawReadingsTable";
import { HISTORY_REPORT_TITLE, HistoryReport } from "./HistoryReport";
import { fileDateStamp, formatDateTime } from "./reportData";
import { renderReportToPdf } from "./renderReportToPdf";

/**
 * Exporta o intervalo filtrado em `/historico` como relatório em PDF
 * (`HistoryPage` → botão "Exportar PDF", carregado por `import()`
 * dinâmico).
 *
 * **Todas as leituras (pedido do usuário, 2026-11-24)**: a tabela da tela é
 * paginada (50 por página), mas o relatório busca o intervalo INTEIRO
 * (`fetchAllReadings`, páginas de 500 em paralelo, ordem cronológica) — sem
 * teto: a API já limita o intervalo a 366 dias. O resumo, os gráficos e a
 * tabela usam o mesmo conjunto completo; a tabela é desenhada em texto no PDF
 * (`drawReadingsTable`), leve mesmo com dezenas de milhares de linhas.
 */
export interface ExportHistoryPdfOptions {
  /** Intervalo já resolvido pelo servidor (o mesmo que a tabela está mostrando). */
  from?: string;
  to?: string;
  /** Só para testes determinísticos — default `new Date()`. */
  generatedAt?: Date;
}

const TABLE_LOGO_SRC = "/jaragua-centro-logo-light-theme.png";

/** Logo institucional em data URL para o cabeçalho da tabela; sem logo se não carregar. */
async function loadLogo(): Promise<{ dataUrl: string; width: number; height: number } | undefined> {
  try {
    const image = new Image();
    image.src = TABLE_LOGO_SRC;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context || canvas.width === 0) {
      return undefined;
    }
    context.drawImage(image, 0, 0);
    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch {
    return undefined;
  }
}

export async function exportHistoryToPdf({
  from,
  to,
  generatedAt = new Date(),
}: ExportHistoryPdfOptions): Promise<void> {
  const result = await fetchAllReadings({ from, to });
  const periodText = `${formatDateTime(result.from)} – ${formatDateTime(result.to)}`;

  await renderReportToPdf(
    createElement(HistoryReport, {
      readings: result.readings,
      from: result.from,
      to: result.to,
      generatedAt,
    }),
    {
      fileName: `ifsclima-historico-${fileDateStamp(generatedAt)}.pdf`,
      title: HISTORY_REPORT_TITLE,
      appendPages: async (pdf) => {
        if (result.readings.length === 0) {
          return;
        }
        drawReadingsTable(pdf, {
          readings: result.readings,
          // "-" e não "–": a Helvetica padrão do PDF não tem o meio-traço.
          periodText: periodText.replace("–", "-"),
          documentTitle: HISTORY_REPORT_TITLE,
          pagesBefore: 1,
          logo: await loadLogo(),
        });
      },
    },
  );
}

export default exportHistoryToPdf;
