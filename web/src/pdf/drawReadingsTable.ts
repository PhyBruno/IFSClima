import type jsPDF from "jspdf";
import type { HistoryReading } from "../api-client";
import { REPORT_METRICS, formatDateTime, formatNumber } from "./reportData";

/**
 * Tabela de leituras do PDF do Histórico desenhada DIRETO no PDF, como texto
 * vetorial (pedido do usuário, 2026-11-24: "não saem todas as leituras").
 *
 * Antes, cada folha da tabela era HTML capturado como imagem: o relatório
 * parava em 560 linhas (14 folhas, para o arquivo não passar de dezenas de
 * MB) e a última folha estourava (40 linhas + o aviso não cabiam). Em texto,
 * cada folha pesa poucos kB e gera em milissegundos, então a tabela traz
 * TODAS as leituras do intervalo, o texto fica selecionável/pesquisável, e a
 * paginação é calculada em milímetros — nenhuma linha é cortada.
 *
 * Visual alinhado às folhas HTML do relatório (mesmas margens, cores slate,
 * zebra, cabeçalho repetido e rodapé "Página X de Y"), com a fonte padrão
 * Helvetica do PDF.
 */
export const TABLE_ROWS_PER_PAGE = 50;

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 11.6;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X;
const HEADER_TOP = 16;
const TABLE_TOP = 32;
const HEAD_HEIGHT = 7;
const ROW_HEIGHT = 4.6;
const FOOTER_LINE = PAGE_HEIGHT - 12;

const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_700: [number, number, number] = [51, 65, 85];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_400: [number, number, number] = [148, 163, 184];
const SLATE_200: [number, number, number] = [226, 232, 240];
const SLATE_50: [number, number, number] = [248, 250, 252];
const EMERALD_700: [number, number, number] = [4, 120, 87];

/** Quantas folhas a tabela ocupa (0 sem leituras). */
export function tablePageCount(rowCount: number): number {
  return Math.ceil(rowCount / TABLE_ROWS_PER_PAGE);
}

interface Column {
  label: string;
  width: number;
  align: "left" | "right";
  value: (reading: HistoryReading, index: number) => string;
}

const INDEX_WIDTH = 12;
const DATE_WIDTH = 36;
const METRIC_WIDTH = (CONTENT_WIDTH - INDEX_WIDTH - DATE_WIDTH) / REPORT_METRICS.length;

const COLUMNS: Column[] = [
  { label: "#", width: INDEX_WIDTH, align: "right", value: (_, index) => String(index + 1) },
  {
    label: "DATA E HORA",
    width: DATE_WIDTH,
    align: "left",
    value: (reading) => formatDateTime(reading.timestamp),
  },
  ...REPORT_METRICS.map((meta): Column => ({
    label: `${meta.label.toUpperCase()}${meta.unit ? ` (${meta.unit})` : ""}`,
    width: METRIC_WIDTH,
    align: "right",
    // "-" e não "—": a Helvetica padrão do PDF não tem o travessão.
    value: (reading) => {
      const text = formatNumber(reading[meta.metric], meta.digits);
      return text === "—" ? "-" : text;
    },
  })),
];

const CELL_PADDING = 2.5;

function cellX(columnIndex: number): { left: number; right: number } {
  const left = MARGIN_X + COLUMNS.slice(0, columnIndex).reduce((acc, c) => acc + c.width, 0);
  return { left, right: left + COLUMNS[columnIndex]!.width };
}

function drawCell(pdf: jsPDF, columnIndex: number, text: string, y: number) {
  const column = COLUMNS[columnIndex]!;
  const { left, right } = cellX(columnIndex);
  if (column.align === "right") {
    pdf.text(text, right - CELL_PADDING, y, { align: "right" });
  } else {
    pdf.text(text, left + CELL_PADDING, y);
  }
}

export interface ReadingsTableOptions {
  /** Leituras em ordem cronológica crescente. */
  readings: HistoryReading[];
  /** Intervalo, já formatado ("25/10/2026 20:24 – 24/11/2026 20:24"). */
  periodText: string;
  documentTitle: string;
  /** Folhas que já existem no PDF antes da tabela (a capa). */
  pagesBefore: number;
  /** Logo institucional (PNG em data URL) para o canto do cabeçalho; opcional. */
  logo?: { dataUrl: string; width: number; height: number };
}

function drawPageChrome(
  pdf: jsPDF,
  options: ReadingsTableOptions,
  pageNumber: number,
  totalPages: number,
  firstRow: number,
  lastRow: number,
) {
  const { readings, periodText, documentTitle, logo } = options;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(...SLATE_900);
  pdf.text("Leituras registradas", MARGIN_X, HEADER_TOP);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...SLATE_500);
  pdf.text(
    `${periodText}  ·  leituras ${firstRow}-${lastRow} de ${readings.length}`,
    MARGIN_X,
    HEADER_TOP + 5.5,
  );

  if (logo) {
    const height = 7;
    const width = (logo.width / logo.height) * height;
    pdf.addImage(logo.dataUrl, "PNG", PAGE_WIDTH - MARGIN_X - width, HEADER_TOP - 5, width, height);
  }

  pdf.setDrawColor(...SLATE_200);
  pdf.setLineWidth(0.25);
  pdf.line(MARGIN_X, HEADER_TOP + 9.5, PAGE_WIDTH - MARGIN_X, HEADER_TOP + 9.5);

  // Rodapé, igual às folhas HTML do relatório.
  pdf.line(MARGIN_X, FOOTER_LINE, PAGE_WIDTH - MARGIN_X, FOOTER_LINE);
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...EMERALD_700);
  pdf.text("IFSClima", MARGIN_X, FOOTER_LINE + 5);
  const brandWidth = pdf.getTextWidth("IFSClima ");
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...SLATE_400);
  pdf.text(`· ${documentTitle}`, MARGIN_X + brandWidth, FOOTER_LINE + 5);
  pdf.text(`Página ${pageNumber} de ${totalPages}`, PAGE_WIDTH - MARGIN_X, FOOTER_LINE + 5, {
    align: "right",
  });
}

function drawTableHead(pdf: jsPDF) {
  pdf.setFillColor(...SLATE_50);
  pdf.setDrawColor(...SLATE_200);
  pdf.rect(MARGIN_X, TABLE_TOP, CONTENT_WIDTH, HEAD_HEIGHT, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  pdf.setTextColor(...SLATE_500);
  COLUMNS.forEach((column, index) => drawCell(pdf, index, column.label, TABLE_TOP + 4.5));
}

/**
 * Acrescenta ao `pdf` as folhas da tabela (a partir da página atual + 1) e
 * devolve quantas folhas foram criadas.
 */
export function drawReadingsTable(pdf: jsPDF, options: ReadingsTableOptions): number {
  const { readings, pagesBefore } = options;
  const pageCount = tablePageCount(readings.length);
  const totalPages = pagesBefore + pageCount;

  for (let page = 0; page < pageCount; page += 1) {
    const start = page * TABLE_ROWS_PER_PAGE;
    const rows = readings.slice(start, start + TABLE_ROWS_PER_PAGE);

    pdf.addPage("a4", "portrait");
    drawPageChrome(
      pdf,
      options,
      pagesBefore + page + 1,
      totalPages,
      start + 1,
      start + rows.length,
    );
    drawTableHead(pdf);

    pdf.setFontSize(7.5);
    rows.forEach((reading, rowIndex) => {
      const top = TABLE_TOP + HEAD_HEIGHT + rowIndex * ROW_HEIGHT;
      if (rowIndex % 2 === 1) {
        pdf.setFillColor(...SLATE_50);
        pdf.rect(MARGIN_X, top, CONTENT_WIDTH, ROW_HEIGHT, "F");
      }
      const baseline = top + ROW_HEIGHT - 1.4;
      COLUMNS.forEach((column, columnIndex) => {
        if (columnIndex === 0) {
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(...SLATE_400);
        } else if (columnIndex === 1) {
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(...SLATE_700);
        } else {
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(...SLATE_500);
        }
        drawCell(pdf, columnIndex, column.value(reading, start + rowIndex), baseline);
      });
    });

    // Borda externa da tabela.
    pdf.setDrawColor(...SLATE_200);
    pdf.rect(MARGIN_X, TABLE_TOP, CONTENT_WIDTH, HEAD_HEIGHT + rows.length * ROW_HEIGHT, "S");
  }

  return pageCount;
}
