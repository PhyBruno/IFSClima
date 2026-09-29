import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderReportToPdf } from "../../src/pdf/renderReportToPdf";
import { ReportPage } from "../../src/pdf/ReportLayout";

/**
 * `html2canvas-pro` (precisa de `<canvas>` real, que o jsdom não tem) e
 * `jsPDF` são mockados: o teste verifica a ORQUESTRAÇÃO — uma captura por
 * `[data-report-page]`, uma página A4 por captura, título/nome do arquivo e
 * limpeza do contêiner fora da tela — não a renderização pixel a pixel.
 */
const addImage = vi.fn();
const addPage = vi.fn();
const save = vi.fn();
const setProperties = vi.fn();

vi.mock("jspdf", () => ({
  default: vi.fn(() => ({ addImage, addPage, save, setProperties })),
}));

const html2canvasMock = vi.fn();
vi.mock("html2canvas-pro", () => ({
  default: (...args: unknown[]) => html2canvasMock(...args),
}));

function fakeCanvas(): HTMLCanvasElement {
  return { toDataURL: () => "data:image/jpeg;base64,fake" } as unknown as HTMLCanvasElement;
}

/** Imagens do jsdom nunca carregam: dispara o evento depois de um tick, quando os listeners já existem. */
async function fireImageEvents(type: "load" | "error") {
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.querySelectorAll("img").forEach((img) => img.dispatchEvent(new Event(type)));
}

function report(pageCount: number) {
  return (
    <>
      {Array.from({ length: pageCount }, (_, i) => (
        <ReportPage key={i} pageNumber={i + 1} totalPages={pageCount} documentTitle="Teste">
          <p>Conteúdo {i + 1}</p>
          <img src="/logo.png" alt="" />
        </ReportPage>
      ))}
    </>
  );
}

describe("renderReportToPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    html2canvasMock.mockResolvedValue(fakeCanvas());
  });

  it("captura cada folha separadamente e monta uma página A4 retrato por folha", async () => {
    const hostsDuringCapture: string[] = [];
    html2canvasMock.mockImplementation(async (page: HTMLElement) => {
      hostsDuringCapture.push(page.textContent ?? "");
      return fakeCanvas();
    });

    const exporting = renderReportToPdf(report(3), { fileName: "rel.pdf", title: "Relatório" });
    await fireImageEvents("load");
    await exporting;

    expect(html2canvasMock).toHaveBeenCalledTimes(3);
    expect(hostsDuringCapture[0]).toContain("Conteúdo 1");
    expect(hostsDuringCapture[2]).toContain("Página 3 de 3");
    expect(html2canvasMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ scale: 2, backgroundColor: "#ffffff", width: 794, height: 1123 }),
    );

    expect(addPage).toHaveBeenCalledTimes(2);
    expect(addPage).toHaveBeenCalledWith("a4", "portrait");
    expect(addImage).toHaveBeenCalledTimes(3);
    expect(addImage).toHaveBeenCalledWith(
      "data:image/jpeg;base64,fake",
      "JPEG",
      0,
      0,
      210,
      297,
      undefined,
      "FAST",
    );
    expect(setProperties).toHaveBeenCalledWith(expect.objectContaining({ title: "Relatório" }));
    expect(save).toHaveBeenCalledWith("rel.pdf");
  });

  it("remove o contêiner fora da tela depois de exportar, mesmo se a captura falhar", async () => {
    html2canvasMock.mockRejectedValue(new Error("canvas"));
    const before = document.body.children.length;

    const exporting = renderReportToPdf(report(1), { fileName: "x.pdf", title: "x" });
    await fireImageEvents("error");

    await expect(exporting).rejects.toThrow("canvas");
    expect(document.body.children.length).toBe(before);
    expect(save).not.toHaveBeenCalled();
  });

  it("relatório sem nenhuma folha é um erro (não gera PDF em branco)", async () => {
    await expect(renderReportToPdf(<p>nada</p>, { fileName: "x.pdf", title: "x" })).rejects.toThrow(
      /sem páginas/,
    );
    expect(html2canvasMock).not.toHaveBeenCalled();
  });
});
