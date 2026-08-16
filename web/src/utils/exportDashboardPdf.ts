import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { formatDayMonth, formatTime } from "./formatTime";

/**
 * Exporta a tela atual do dashboard em PDF (pedido do usuário, 2026-08-16:
 * "opção de exportar a tela atual em PDF, trazendo os dados da tela, de
 * forma moderna, para uso em sala de aula"). `DashboardPage` liga o botão
 * "Exportar PDF" a `exportDashboardToPdf`, passando o elemento que envolve
 * `SensorGrid`+`ChartsSection` (não a página inteira — Sidebar/BottomNav/o
 * próprio botão ficam de fora, ver `data-pdf-ignore` abaixo).
 *
 * **Screenshot (`html2canvas`) + capa própria (`jsPDF` puro), não só
 * screenshot**: uma captura pura da tela escura ficaria pesada de imprimir
 * numa sala de aula (fundo preto consome tinta/toner) e não tem identidade
 * de documento. A capa (`drawCoverPage`) é desenhada com a API vetorial do
 * jsPDF — fundo claro, título/subtítulo/data de exportação — e só DEPOIS
 * disso o screenshot real da tela (com os valores exibidos no momento do
 * clique) entra em página(s) seguintes, paginado se for mais alto que uma
 * folha A4.
 *
 * **`ignoreElements` via `data-pdf-ignore`**: em vez de exigir que o
 * chamador passe um elemento cirurgicamente recortado (arriscando cortar
 * algo que devia estar no PDF), qualquer nó com `data-pdf-ignore="true"`
 * dentro do elemento capturado é pulado pelo `html2canvas` — usado pelo
 * próprio botão "Exportar PDF" (fica dentro do header capturado, mas nunca
 * deveria aparecer NO PDF que ele mesmo gera).
 */
export interface ExportDashboardPdfOptions {
  /** Elemento DOM a capturar — tipicamente o container principal da página (sem Sidebar/BottomNav). */
  element: HTMLElement;
  /** Nome da estação exibido na capa. */
  stationLabel?: string;
  /** Só para testes determinísticos — default `new Date()`. */
  generatedAt?: Date;
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 14;
const USABLE_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;
const USABLE_HEIGHT_MM = A4_HEIGHT_MM - MARGIN_MM * 2;

/** `"DD/MM/AAAA HH:MM"` no fuso local — reaproveita `formatDayMonth`/`formatTime` (mesmas usadas no resto da UI), só acrescenta o ano por extenso que os dois omitem. */
function formatFullDateTime(date: Date): string {
  const iso = date.toISOString();
  return `${formatDayMonth(iso)}/${date.getFullYear()} ${formatTime(iso)}`;
}

function drawCoverPage(pdf: jsPDF, stationLabel: string, generatedAt: Date): void {
  pdf.setFillColor(22, 163, 74); // --color-brand-primary
  pdf.rect(0, 0, A4_WIDTH_MM, 48, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text("IFSClima", MARGIN_MM, 24);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  pdf.text("Relatório do Painel de Monitoramento", MARGIN_MM, 36);

  pdf.setTextColor(31, 41, 55);
  pdf.setFontSize(11);
  pdf.text(`Estação: ${stationLabel}`, MARGIN_MM, 62);
  pdf.text(`Exportado em: ${formatFullDateTime(generatedAt)}`, MARGIN_MM, 70);

  pdf.setTextColor(107, 114, 128);
  pdf.setFontSize(9);
  pdf.text(
    "Documento gerado para uso em sala de aula — dados brutos disponíveis na página /historico.",
    MARGIN_MM,
    82,
  );

  pdf.setDrawColor(230, 232, 235);
  pdf.line(MARGIN_MM, 90, A4_WIDTH_MM - MARGIN_MM, 90);
}

/** Recorta `canvas` numa sequência de páginas A4 (a mesma imagem inteira, deslocada pra cima a cada página — técnica padrão `html2canvas`+`jsPDF`). */
function addCanvasPages(pdf: jsPDF, canvas: HTMLCanvasElement): void {
  const imgData = canvas.toDataURL("image/png");
  const imgHeightMm = (canvas.height * USABLE_WIDTH_MM) / canvas.width;

  let heightLeftMm = imgHeightMm;
  let offsetMm = 0;

  pdf.addPage();
  pdf.addImage(imgData, "PNG", MARGIN_MM, MARGIN_MM, USABLE_WIDTH_MM, imgHeightMm);
  heightLeftMm -= USABLE_HEIGHT_MM;

  while (heightLeftMm > 0) {
    offsetMm += USABLE_HEIGHT_MM;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", MARGIN_MM, MARGIN_MM - offsetMm, USABLE_WIDTH_MM, imgHeightMm);
    heightLeftMm -= USABLE_HEIGHT_MM;
  }
}

export async function exportDashboardToPdf({
  element,
  stationLabel = "main",
  generatedAt = new Date(),
}: ExportDashboardPdfOptions): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: "#0d1117",
    scale: 2,
    ignoreElements: (node) => node instanceof HTMLElement && node.dataset.pdfIgnore === "true",
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawCoverPage(pdf, stationLabel, generatedAt);
  addCanvasPages(pdf, canvas);

  const stamp = generatedAt.toISOString().slice(0, 10);
  pdf.save(`ifsclima-dashboard-${stamp}.pdf`);
}

export default exportDashboardToPdf;
