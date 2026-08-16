import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `exportDashboardToPdf` (`utils/exportDashboardPdf.ts`, pedido do usuário,
 * 2026-08-16) — `html2canvas` (precisa de `<canvas>` real, que o jsdom não
 * implementa) e `jsPDF` são mockados: o que este teste verifica é a
 * ORQUESTRAÇÃO (capa desenhada antes do screenshot, paginação quando o
 * conteúdo é mais alto que uma página A4, nome do arquivo), não a
 * renderização pixel-a-pixel de nenhuma das duas libs.
 */
const addImage = vi.fn();
const addPage = vi.fn();
const save = vi.fn();
const setFillColor = vi.fn();
const setTextColor = vi.fn();
const setFont = vi.fn();
const setFontSize = vi.fn();
const text = vi.fn();
const rect = vi.fn();
const setDrawColor = vi.fn();
const line = vi.fn();

const jsPDFInstance = {
  addImage,
  addPage,
  save,
  setFillColor,
  setTextColor,
  setFont,
  setFontSize,
  text,
  rect,
  setDrawColor,
  line,
};

vi.mock("jspdf", () => ({
  default: vi.fn(() => jsPDFInstance),
}));

const html2canvasMock = vi.fn();
vi.mock("html2canvas", () => ({
  default: (...args: unknown[]) => html2canvasMock(...args),
}));

let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

function fakeCanvas(width: number, height: number): HTMLCanvasElement {
  return {
    width,
    height,
    toDataURL: () => "data:image/png;base64,fake",
  } as unknown as HTMLCanvasElement;
}

describe("exportDashboardToPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captura o elemento passado com fundo escuro fixo e ignora nós data-pdf-ignore", async () => {
    html2canvasMock.mockResolvedValue(fakeCanvas(1000, 500));
    const { exportDashboardToPdf } = await import("../../src/utils/exportDashboardPdf");

    const ignoredNode = document.createElement("button");
    ignoredNode.dataset.pdfIgnore = "true";
    const normalNode = document.createElement("div");
    const element = document.createElement("div");

    await exportDashboardToPdf({ element, generatedAt: new Date("2026-08-16T12:00:00.000Z") });

    expect(html2canvasMock).toHaveBeenCalledWith(
      element,
      expect.objectContaining({ backgroundColor: "#0d1117", scale: 2 }),
    );
    const { ignoreElements } = html2canvasMock.mock.calls[0]![1] as {
      ignoreElements: (node: Element) => boolean;
    };
    expect(ignoreElements(ignoredNode)).toBe(true);
    expect(ignoreElements(normalNode)).toBe(false);
  });

  it("desenha a capa (fundo + título) antes de qualquer imagem", async () => {
    html2canvasMock.mockResolvedValue(fakeCanvas(1000, 500));
    const { exportDashboardToPdf } = await import("../../src/utils/exportDashboardPdf");

    await exportDashboardToPdf({
      element: document.createElement("div"),
      stationLabel: "main",
      generatedAt: new Date("2026-08-16T12:00:00.000Z"),
    });

    expect(rect).toHaveBeenCalled();
    expect(text.mock.calls.some((call) => call[0] === "IFSClima")).toBe(true);
    expect(text.mock.calls.some((call) => String(call[0]).includes("Estação: main"))).toBe(true);
    expect(text.mock.calls.some((call) => String(call[0]).includes("16/08/2026"))).toBe(true);

    const firstImageCallIndex = addImage.mock.invocationCallOrder[0]!;
    const firstTextCallIndex = text.mock.invocationCallOrder[0]!;
    expect(firstTextCallIndex).toBeLessThan(firstImageCallIndex);
  });

  it("conteúdo que cabe numa página só adiciona 1 página de imagem (mais a capa)", async () => {
    // canvas quase quadrado -> altura convertida em mm cabe dentro de USABLE_HEIGHT_MM.
    html2canvasMock.mockResolvedValue(fakeCanvas(1000, 800));
    const { exportDashboardToPdf } = await import("../../src/utils/exportDashboardPdf");

    await exportDashboardToPdf({ element: document.createElement("div") });

    // 1 addPage pra capa->conteúdo + nenhum adicional de paginação.
    expect(addPage).toHaveBeenCalledTimes(1);
    expect(addImage).toHaveBeenCalledTimes(1);
  });

  it("conteúdo mais alto que uma página A4 é paginado em várias imagens", async () => {
    // canvas bem alto (proporção larga) força imgHeightMm >> USABLE_HEIGHT_MM.
    html2canvasMock.mockResolvedValue(fakeCanvas(1000, 6000));
    const { exportDashboardToPdf } = await import("../../src/utils/exportDashboardPdf");

    await exportDashboardToPdf({ element: document.createElement("div") });

    expect(addPage.mock.calls.length).toBeGreaterThan(1);
    expect(addImage.mock.calls.length).toBeGreaterThan(1);
  });

  it("salva o arquivo com o timestamp AAAA-MM-DD de generatedAt", async () => {
    html2canvasMock.mockResolvedValue(fakeCanvas(1000, 500));
    const { exportDashboardToPdf } = await import("../../src/utils/exportDashboardPdf");

    await exportDashboardToPdf({
      element: document.createElement("div"),
      generatedAt: new Date("2026-08-16T12:00:00.000Z"),
    });

    expect(save).toHaveBeenCalledWith("ifsclima-dashboard-2026-08-16.pdf");
  });
});
