import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
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
 * clique) entra numa segunda página, em PAISAGEM (ver `LANDSCAPE_USABLE_*`
 * abaixo) para acompanhar a proporção larga do próprio dashboard.
 *
 * **`ignoreElements` via `data-pdf-ignore`**: em vez de exigir que o
 * chamador passe um elemento cirurgicamente recortado (arriscando cortar
 * algo que devia estar no PDF), qualquer nó com `data-pdf-ignore="true"`
 * dentro do elemento capturado é pulado pelo `html2canvas` — usado pelo
 * próprio botão "Exportar PDF" (fica dentro do header capturado, mas nunca
 * deveria aparecer NO PDF que ele mesmo gera).
 *
 * **`html2canvas-pro`, não `html2canvas`**: o tema do shadcn/ui (Tailwind v4)
 * define todas as cores em `oklch()`, que o `html2canvas` original não sabe
 * interpretar (aborta a captura). O fork `-pro` tem a mesma API e suporta
 * `oklch`/`color-mix`. O fundo da captura é o `background-color` real do
 * `<body>` no momento do clique — segue o tema ativo (claro/escuro).
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

/**
 * Página(s) de conteúdo em PAISAGEM, não retrato (correção, feedback do
 * usuário, 2026-08-16: "não está de acordo com o layout original"). O
 * dashboard capturado é sempre mais LARGO que alto (grid de cards/gráficos
 * em 2-3 colunas) — numa folha A4 RETRATO (210×297mm), ajustar pela largura
 * sobrava quase metade da página em branco abaixo do conteúdo, bem diferente
 * da tela cheia que o usuário vê. Em PAISAGEM (297×210mm) a proporção da
 * página fica muito mais parecida com a do próprio dashboard — o mesmo
 * screenshot ocupa a página quase inteira. A capa continua em retrato (like
 * a capa de um relatório) — só a(s) página(s) de conteúdo mudam.
 */
const LANDSCAPE_USABLE_WIDTH_MM = A4_HEIGHT_MM - MARGIN_MM * 2;
const LANDSCAPE_USABLE_HEIGHT_MM = A4_WIDTH_MM - MARGIN_MM * 2;

/**
 * `html2canvas` dimensiona o canvas de saída EXATAMENTE para
 * `element.getBoundingClientRect().height` — mas o próprio `html2canvas`
 * pinta a última linha de texto um pouco mais abaixo do que o navegador
 * renderiza nativamente (verificado por captura direta: sem esse respiro, o
 * rodapé — "Atualizado há X", a última coisa capturada — saía com a base das
 * letras cortada, mesmo a `<footer>` não tendo overflow nem padding
 * insuficiente na tela real). Um respiro pequeno na ALTURA pedida ao
 * `html2canvas` (não no elemento em si — a tela ao vivo não muda) é
 * suficiente pra dar esse espaço; a imagem final na página do PDF fica só
 * alguns milímetros mais alta, imperceptível no layout do documento.
 */
const CAPTURE_BOTTOM_BUFFER_PX = 16;

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

/**
 * Encaixa `canvas` inteiro numa única página A4 PAISAGEM, do jeito que
 * `background-size: contain` faria — trava pela LARGURA se isso já couber na
 * altura disponível, senão trava pela ALTURA (exatamente um dos dois sempre
 * serve, nunca os dois estouram ao mesmo tempo — é a mesma prova matemática
 * de "contain fit"), e centraliza o resultado na página. O conteúdo do
 * dashboard tem altura ESTÁVEL por design (`DashboardPage` sempre renderiza
 * o mesmo número de cards/gráficos — trocar o período em `ChartsSection` não
 * adiciona linhas novas, só troca os dados dos mesmos cards), então uma
 * página só é suficiente na prática — sem a lógica de paginação por
 * deslocamento vertical que uma tabela/lista de tamanho variável exigiria.
 */
function addCanvasPage(pdf: jsPDF, canvas: HTMLCanvasElement): void {
  const imgData = canvas.toDataURL("image/png");

  const widthLockedHeightMm = (canvas.height * LANDSCAPE_USABLE_WIDTH_MM) / canvas.width;

  let imgWidthMm: number;
  let imgHeightMm: number;
  if (widthLockedHeightMm <= LANDSCAPE_USABLE_HEIGHT_MM) {
    imgWidthMm = LANDSCAPE_USABLE_WIDTH_MM;
    imgHeightMm = widthLockedHeightMm;
  } else {
    imgHeightMm = LANDSCAPE_USABLE_HEIGHT_MM;
    imgWidthMm = (canvas.width * LANDSCAPE_USABLE_HEIGHT_MM) / canvas.height;
  }

  const xMm = MARGIN_MM + (LANDSCAPE_USABLE_WIDTH_MM - imgWidthMm) / 2;
  const yMm = MARGIN_MM + (LANDSCAPE_USABLE_HEIGHT_MM - imgHeightMm) / 2;

  pdf.addPage("a4", "landscape");
  pdf.addImage(imgData, "PNG", xMm, yMm, imgWidthMm, imgHeightMm);
}

export async function exportDashboardToPdf({
  element,
  stationLabel = "main",
  generatedAt = new Date(),
}: ExportDashboardPdfOptions): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    scale: 2,
    height: Math.ceil(element.getBoundingClientRect().height) + CAPTURE_BOTTOM_BUFFER_PX,
    ignoreElements: (node) => node instanceof HTMLElement && node.dataset.pdfIgnore === "true",
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawCoverPage(pdf, stationLabel, generatedAt);
  addCanvasPage(pdf, canvas);

  const stamp = generatedAt.toISOString().slice(0, 10);
  pdf.save(`ifsclima-dashboard-${stamp}.pdf`);
}

export default exportDashboardToPdf;
