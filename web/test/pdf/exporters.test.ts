import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import { exportDashboardToPdf } from "../../src/pdf/exportDashboardPdf";
import { exportHistoryToPdf } from "../../src/pdf/exportHistoryPdf";
import { renderReportToPdf, type RenderReportOptions } from "../../src/pdf/renderReportToPdf";
import type jsPDF from "jspdf";
import type { DashboardReportProps } from "../../src/pdf/DashboardReport";
import type { HistoryReportProps } from "../../src/pdf/HistoryReport";
import { HISTORY_MAX_PAGE_SIZE, type HistoryReading } from "../../src/api-client";
import {
  emptyHistoryFixture,
  historyFixture,
  latestFixture,
  seriesFixture,
} from "../fixtures/readings";

/**
 * Os exportadores só BUSCAM os dados e escolhem o relatório/nome do arquivo;
 * a captura em si (`renderReportToPdf`) é mockada e tem teste próprio. MSW
 * responde a API como nos demais testes.
 */
vi.mock("../../src/pdf/renderReportToPdf", () => ({ renderReportToPdf: vi.fn() }));

const GENERATED_AT = new Date("2026-07-23T15:00:00.000Z");

function lastReport<P>(): { props: P; options: RenderReportOptions } {
  const [element, options] = vi.mocked(renderReportToPdf).mock.calls.at(-1)!;
  expect(isValidElement(element)).toBe(true);
  return { props: (element as ReactElement<P>).props, options };
}

beforeEach(() => {
  vi.mocked(renderReportToPdf).mockReset();
  vi.mocked(renderReportToPdf).mockResolvedValue();
});

describe("exportDashboardToPdf", () => {
  it("reaproveita o cache do React Query (o que está na tela) e busca só o que falta", async () => {
    const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });
    const cachedLatest = { ...latestFixture, temperature_c: 99 };
    queryClient.setQueryData(["readings", "latest"], cachedLatest);

    await exportDashboardToPdf({ queryClient, period: { range: "7d" }, generatedAt: GENERATED_AT });

    const { props, options } = lastReport<DashboardReportProps>();
    expect(props.latest).toEqual(cachedLatest);
    expect(props.period).toEqual({ range: "7d" });
    expect(Object.keys(props.series)).toHaveLength(5);
    expect(props.series.temperature_c).toEqual(seriesFixture);
    expect(options.fileName).toBe("ifsclima-painel-7d-2026-07-23.pdf");
  });

  it("uma série que falha não impede o PDF (sai sem aquele gráfico)", async () => {
    server.use(
      http.get("/api/v1/readings/series", ({ request }) =>
        new URL(request.url).searchParams.get("metric") === "uv_index"
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(seriesFixture),
      ),
    );
    const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });

    await exportDashboardToPdf({
      queryClient,
      period: { range: "24h" },
      generatedAt: GENERATED_AT,
    });

    const { props } = lastReport<DashboardReportProps>();
    expect(props.series.uv_index).toBeUndefined();
    expect(props.series.humidity_pct).toBeDefined();
    expect(props.latest).toEqual(latestFixture);
  });

  it("sem NENHUM dado carregado, lança (a página mostra o erro) e não gera PDF", async () => {
    server.use(
      http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })),
      http.get("/api/v1/readings/series", () => new HttpResponse(null, { status: 500 })),
    );
    const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(exportDashboardToPdf({ queryClient, period: { range: "24h" } })).rejects.toThrow();
    expect(renderReportToPdf).not.toHaveBeenCalled();
  });
});

describe("exportDashboardToPdf — comparativos", () => {
  it("leva as leituras brutas da MESMA janela das séries (gráficos de pontos)", async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get("/api/v1/readings", ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json(historyFixture);
      }),
    );
    const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });

    await exportDashboardToPdf({
      queryClient,
      period: { range: "24h" },
      generatedAt: GENERATED_AT,
    });

    expect(requests[0]!.get("from")).toBe(seriesFixture.from);
    expect(requests[0]!.get("to")).toBe(seriesFixture.to);
    const { props } = lastReport<DashboardReportProps>();
    expect(props.readings).toEqual(historyFixture.readings);
  });

  it("falha nas leituras brutas não impede o PDF (pontos saem vazios)", async () => {
    server.use(http.get("/api/v1/readings", () => new HttpResponse(null, { status: 500 })));
    const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });

    await exportDashboardToPdf({
      queryClient,
      period: { range: "24h" },
      generatedAt: GENERATED_AT,
    });

    expect(lastReport<DashboardReportProps>().props.readings).toEqual([]);
  });
});

describe("exportHistoryToPdf", () => {
  it("usa o intervalo resolvido pela API e nomeia o arquivo pela data de geração", async () => {
    await exportHistoryToPdf({
      from: historyFixture.from,
      to: historyFixture.to,
      generatedAt: GENERATED_AT,
    });

    const { props, options } = lastReport<HistoryReportProps>();
    expect(props.readings).toEqual(historyFixture.readings);
    expect(props.from).toBe(historyFixture.from);
    expect(props.to).toBe(historyFixture.to);
    expect(options.fileName).toBe("ifsclima-historico-2026-07-23.pdf");
  });

  it("busca TODAS as leituras do intervalo (sem teto), em ordem cronológica", async () => {
    const total = HISTORY_MAX_PAGE_SIZE * 12 + 37;
    const requestedPages: number[] = [];
    server.use(
      http.get("/api/v1/readings", ({ request }) => {
        const params = new URL(request.url).searchParams;
        const page = Number(params.get("page"));
        expect(params.get("order")).toBe("asc");
        requestedPages.push(page);
        const start = (page - 1) * HISTORY_MAX_PAGE_SIZE;
        const count = Math.max(0, Math.min(HISTORY_MAX_PAGE_SIZE, total - start));
        const readings: HistoryReading[] = Array.from({ length: count }, (_, i) => ({
          ...historyFixture.readings[0]!,
          timestamp: new Date(
            Date.parse("2026-07-01T00:00:00.000Z") + (start + i) * 60_000,
          ).toISOString(),
        }));
        return HttpResponse.json({ ...historyFixture, page, total, readings });
      }),
    );

    await exportHistoryToPdf({ generatedAt: GENERATED_AT });

    expect(requestedPages).toHaveLength(13);
    const { props } = lastReport<HistoryReportProps>();
    expect(props.readings).toHaveLength(total);
    expect(props.readings[0]!.timestamp < props.readings.at(-1)!.timestamp).toBe(true);
  });

  it("a tabela é anexada como folhas de texto (appendPages → drawReadingsTable)", async () => {
    await exportHistoryToPdf({ generatedAt: GENERATED_AT });

    const { options } = lastReport<HistoryReportProps>();
    const texts: string[] = [];
    const pdf = {
      addPage: vi.fn(),
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      setDrawColor: vi.fn(),
      setFillColor: vi.fn(),
      setLineWidth: vi.fn(),
      line: vi.fn(),
      rect: vi.fn(),
      addImage: vi.fn(),
      getTextWidth: () => 10,
      text: (value: string) => texts.push(value),
    };
    await options.appendPages!(pdf as unknown as jsPDF);

    expect(pdf.addPage).toHaveBeenCalledTimes(1);
    expect(texts).toContain("Página 2 de 2");
    expect(texts).toContain("24,7");
  });

  it("intervalo sem leituras: nenhuma folha de tabela", async () => {
    server.use(http.get("/api/v1/readings", () => HttpResponse.json(emptyHistoryFixture)));

    await exportHistoryToPdf({ generatedAt: GENERATED_AT });

    const addPage = vi.fn();
    await lastReport<HistoryReportProps>().options.appendPages!({ addPage } as unknown as jsPDF);
    expect(addPage).not.toHaveBeenCalled();
  });
});
