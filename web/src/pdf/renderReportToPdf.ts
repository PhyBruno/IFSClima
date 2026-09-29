import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import { PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from "./ReportLayout";

/**
 * Converte um relatório React (um fragmento de `ReportPage`s) em PDF A4.
 *
 * **Relatório próprio, não screenshot da tela**: a versão anterior
 * capturava o dashboard ao vivo (tema escuro, layout responsivo da tela,
 * sidebar recortada) e colava a imagem numa página. Agora o documento é um
 * layout HTML dedicado, sempre claro e com tamanho de folha fixo. Ele é
 * montado num contêiner fora da área visível, e o `html2canvas-pro` captura
 * uma `[data-report-page]` por vez, gerando uma página do PDF para cada.
 * Assim nenhuma página corta um card ou uma linha da tabela ao meio.
 *
 * **`html2canvas-pro`, não `html2canvas`**: o Tailwind v4 gera as cores em
 * `oklch()`, que o `html2canvas` original não interpreta.
 *
 * **JPEG a 2×**: nitidez de impressão (≈190 dpi em A4) com arquivo leve. PNG
 * de página inteira deixava o PDF do histórico com dezenas de MB.
 */
export interface RenderReportOptions {
  fileName: string;
  title: string;
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const CAPTURE_SCALE = 2;
const JPEG_QUALITY = 0.92;

/** Teto de espera por imagem: um logo que não carrega não pode travar a exportação. */
const IMAGE_TIMEOUT_MS = 5000;

/** Espera fontes e imagens (logo) carregarem: capturar antes disso sai com fonte de fallback ou buraco no lugar do logo. */
async function waitForAssets(container: HTMLElement): Promise<void> {
  await document.fonts?.ready;
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, IMAGE_TIMEOUT_MS);
            const done = () => {
              clearTimeout(timer);
              resolve();
            };
            image.addEventListener("load", done, { once: true });
            image.addEventListener("error", done, { once: true });
          }),
    ),
  );
}

export async function renderReportToPdf(
  report: ReactElement,
  { fileName, title }: RenderReportOptions,
): Promise<void> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-${PAGE_WIDTH_PX * 2}px;top:0;width:${PAGE_WIDTH_PX}px;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => root.render(report));
    await waitForAssets(host);

    const pages = Array.from(host.querySelectorAll<HTMLElement>("[data-report-page]"));
    if (pages.length === 0) {
      throw new Error("Relatório sem páginas para exportar");
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.setProperties({ title, creator: "IFSClima", subject: title });

    for (const [index, page] of pages.entries()) {
      const canvas = await html2canvas(page, {
        scale: CAPTURE_SCALE,
        backgroundColor: "#ffffff",
        width: PAGE_WIDTH_PX,
        height: PAGE_HEIGHT_PX,
        windowWidth: PAGE_WIDTH_PX,
        logging: false,
      });

      if (index > 0) {
        pdf.addPage("a4", "portrait");
      }
      pdf.addImage(
        canvas.toDataURL("image/jpeg", JPEG_QUALITY),
        "JPEG",
        0,
        0,
        A4_WIDTH_MM,
        A4_HEIGHT_MM,
        undefined,
        "FAST",
      );
    }

    pdf.save(fileName);
  } finally {
    root.unmount();
    host.remove();
  }
}

export default renderReportToPdf;
