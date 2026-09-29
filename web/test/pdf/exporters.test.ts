import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import { exportDashboardToPdf } from "../../src/pdf/exportDashboardPdf";
import {
  HISTORY_FETCH_PAGE_SIZE,
  MAX_READINGS,
  exportHistoryToPdf,
} from "../../src/pdf/exportHistoryPdf";
import { renderReportToPdf } from "../../src/pdf/renderReportToPdf";
import type { DashboardReportProps } from "../../src/pdf/DashboardReport";
import type { HistoryReportProps } from "../../src/pdf/HistoryReport";
import type { HistoryReading } from "../../src/api-client";
import { historyFixture, latestFixture, seriesFixture } from "../fixtures/readings";

/**
 * Os exportadores só BUSCAM os dados e escolhem o relatório/nome do arquivo;
 * a captura em si (`renderReportToPdf`) é mockada e tem teste próprio. MSW
 * responde a API como nos demais testes.
 */
vi.mock("../../src/pdf/renderReportToPdf", () => ({ renderReportToPdf: vi.fn() }));

const GENERATED_AT = new Date("2026-07-23T15:00:00.000Z");

function lastReport<P>(): { props: P; options: { fileName: string; title: string } } {
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

    await exportDashboardToPdf({ queryClient, range: "7d", generatedAt: GENERATED_AT });

    const { props, options } = lastReport<DashboardReportProps>();
    expect(props.latest).toEqual(cachedLatest);
    expect(props.range).toBe("7d");
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

    await exportDashboardToPdf({ queryClient, range: "24h", generatedAt: GENERATED_AT });

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

    await expect(exportDashboardToPdf({ queryClient, range: "24h" })).rejects.toThrow();
    expect(renderReportToPdf).not.toHaveBeenCalled();
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
    expect(props.total).toBe(2);
    expect(props.from).toBe(historyFixture.from);
    expect(props.to).toBe(historyFixture.to);
    expect(options.fileName).toBe("ifsclima-historico-2026-07-23.pdf");
  });

  it("busca todas as páginas do intervalo em lotes do tamanho máximo da API, até MAX_READINGS", async () => {
    const total = MAX_READINGS + 700;
    const requestedPages: string[] = [];
    server.use(
      http.get("/api/v1/readings", ({ request }) => {
        const params = new URL(request.url).searchParams;
        requestedPages.push(
          `${params.get("page")}:${params.get("page_size")}:${params.get("order")}`,
        );
        const page = Number(params.get("page"));
        const start = (page - 1) * HISTORY_FETCH_PAGE_SIZE;
        const count = Math.max(0, Math.min(HISTORY_FETCH_PAGE_SIZE, total - start));
        const readings: HistoryReading[] = Array.from({ length: count }, (_, i) => ({
          ...historyFixture.readings[0]!,
          timestamp: new Date(
            Date.parse("2026-07-23T14:30:00.000Z") - (start + i) * 60_000,
          ).toISOString(),
        }));
        return HttpResponse.json({ ...historyFixture, page, total, readings });
      }),
    );

    await exportHistoryToPdf({ generatedAt: GENERATED_AT });

    expect(requestedPages).toHaveLength(MAX_READINGS / HISTORY_FETCH_PAGE_SIZE);
    expect(requestedPages[0]).toBe(`1:${HISTORY_FETCH_PAGE_SIZE}:desc`);
    const { props } = lastReport<HistoryReportProps>();
    expect(props.readings).toHaveLength(MAX_READINGS);
    expect(props.total).toBe(total);
  });

  it("para quando a API devolve uma página incompleta (fim dos dados)", async () => {
    let calls = 0;
    server.use(
      http.get("/api/v1/readings", () => {
        calls += 1;
        // `total` desatualizado (maior que o real): a página curta encerra a busca mesmo assim.
        return HttpResponse.json({ ...historyFixture, total: 10_000 });
      }),
    );

    await exportHistoryToPdf({});

    expect(calls).toBe(1);
  });
});
