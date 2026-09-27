import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `exportDashboardToPdf` (`utils/exportDashboardPdf.ts`, pedido do usuário,
 * 2026-08-16) — `html2canvas` (precisa de `<canvas>` real, que o jsdom não
 * implementa) e `jsPDF` são mockados: o que este teste verifica é a
 * ORQUESTRAÇÃO (capa desenhada antes do screenshot, página de conteúdo em
 * PAISAGEM com fit "contain" — trava pela largura ou pela altura conforme a
 * proporção do canvas capturado —, nome do arquivo), não a renderização
 * pixel-a-pixel de nenhuma das duas libs.
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
vi.mock("html2canvas-pro", () => ({
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
      expect.objectContaining({ backgroundColor: expect.any(String), scale: 2 }),
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

  it("sempre adiciona exatamente 1 página de conteúdo, em paisagem (a4/landscape)", async () => {
    html2canvasMock.mockResolvedValue(fakeCanvas(1000, 800));
    const { exportDashboardToPdf } = await import("../../src/utils/exportDashboardPdf");

    await exportDashboardToPdf({ element: document.createElement("div") });

    expect(addPage).toHaveBeenCalledTimes(1);
    expect(addPage).toHaveBeenCalledWith("a4", "landscape");
    expect(addImage).toHaveBeenCalledTimes(1);
  });

  it("canvas largo/baixo (proporção típica do dashboard) trava pela LARGURA da página paisagem (269mm), centralizado verticalmente", async () => {
    // widthLockedHeight = 400 * 269/2000 ≈ 53.8mm, bem abaixo dos 182mm de altura útil -> trava largura.
    html2canvasMock.mockResolvedValue(fakeCanvas(2000, 400));
    const { exportDashboardToPdf } = await import("../../src/utils/exportDashboardPdf");

    await exportDashboardToPdf({ element: document.createElement("div") });

    const [, , x, y, w, h] = addImage.mock.calls[0]!;
    expect(w).toBeCloseTo(269, 0);
    expect(x).toBeCloseTo(14, 0); // MARGIN_MM, sem sobra horizontal pra centralizar.
    expect(h).toBeCloseTo(53.8, 0);
    expect(y).toBeGreaterThan(14); // centralizado: sobra metade da altura livre acima da margem.
  });

  it("canvas alto/estreito trava pela ALTURA da página paisagem (182mm), centralizado horizontalmente", async () => {
    // heightLockedWidth = 500 * 182/3000 ≈ 30.3mm, bem abaixo dos 269mm de largura útil -> trava altura.
    html2canvasMock.mockResolvedValue(fakeCanvas(500, 3000));
    const { exportDashboardToPdf } = await import("../../src/utils/exportDashboardPdf");

    await exportDashboardToPdf({ element: document.createElement("div") });

    const [, , x, y, w, h] = addImage.mock.calls[0]!;
    expect(h).toBeCloseTo(182, 0);
    expect(y).toBeCloseTo(14, 0); // MARGIN_MM, sem sobra vertical pra centralizar.
    expect(w).toBeCloseTo(30.3, 0);
    expect(x).toBeGreaterThan(14); // centralizado: sobra metade da largura livre à direita da margem.
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
