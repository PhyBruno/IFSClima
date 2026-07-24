import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import {
  ChartsSection,
  bucketsToBarSeries,
  bucketsToLineSeries,
  buildSearchWithRange,
  buildXLabels,
  getRangeFromSearch,
} from "../../src/components/ChartsSection";
import { emptySeriesFixture, rainSeriesFixture, seriesFixture } from "../fixtures/readings";

/**
 * Formatação de rótulo de eixo X usa `Date#getHours`/`getDate` (hora LOCAL do
 * cliente, design.md "Timezone: formatar no cliente a partir de UTC") — fixa
 * o fuso do processo em UTC para os asserts ficarem determinísticos
 * independente da máquina/CI que roda o teste.
 */
let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
  return () => {
    process.env.TZ = originalTZ;
  };
});

function createWrapper() {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("funções puras de ChartsSection", () => {
  describe("getRangeFromSearch", () => {
    it("default 24h quando não há ?range= na URL", () => {
      expect(getRangeFromSearch("")).toBe("24h");
    });

    it("lê o range da query string quando é um valor válido", () => {
      expect(getRangeFromSearch("?range=7d")).toBe("7d");
      expect(getRangeFromSearch("?range=30d")).toBe("30d");
    });

    it("cai no default 24h para um valor desconhecido/inválido", () => {
      expect(getRangeFromSearch("?range=1y")).toBe("24h");
    });
  });

  describe("buildSearchWithRange", () => {
    it("adiciona ?range= a uma query string vazia", () => {
      expect(buildSearchWithRange("", "7d")).toBe("?range=7d");
    });

    it("substitui um range existente preservando outros parâmetros", () => {
      expect(buildSearchWithRange("?range=24h&foo=bar", "30d")).toBe("?range=30d&foo=bar");
    });
  });

  describe("bucketsToLineSeries", () => {
    it("mapeia o campo avg de cada bucket para points, ignorando o sum", () => {
      const series = bucketsToLineSeries(seriesFixture, "Temperatura", "#f97316");

      expect(series).toEqual([{ label: "Temperatura", color: "#f97316", points: [24.1, 24.7] }]);
    });

    it("buckets=[] produz series=[] (ChartCard mostra EmptyState sozinho)", () => {
      expect(bucketsToLineSeries(emptySeriesFixture, "Temperatura", "#f97316")).toEqual([]);
    });

    it("response undefined (query ainda carregando) produz series=[]", () => {
      expect(bucketsToLineSeries(undefined, "Temperatura", "#f97316")).toEqual([]);
    });
  });

  describe("bucketsToBarSeries", () => {
    it("mapeia o campo sum de cada bucket (não avg) — chuva usa agregação acumulada", () => {
      const series = bucketsToBarSeries(rainSeriesFixture, "Chuva", "#06b6d4");

      expect(series).toEqual([{ label: "Chuva", color: "#06b6d4", points: [0.4, 0.1] }]);
    });

    it("buckets com sum=null (ex.: métrica não-chuva) produz series=[]", () => {
      expect(bucketsToBarSeries(seriesFixture, "Chuva", "#06b6d4")).toEqual([]);
    });
  });

  describe("buildXLabels", () => {
    it("sem resposta ou buckets=[] retorna []", () => {
      expect(buildXLabels(undefined)).toEqual([]);
      expect(buildXLabels(emptySeriesFixture)).toEqual([]);
    });

    it("bucket='hour': formata HH:mm do primeiro e do último bucket", () => {
      expect(buildXLabels(seriesFixture)).toEqual(["13:00", "14:00"]);
    });

    it("bucket='day': formata dd/mm", () => {
      const dayResponse = {
        ...seriesFixture,
        bucket: "day" as const,
        buckets: [
          { t: "2026-07-01T00:00:00.000Z", avg: 1, min: 1, max: 1, sum: null },
          { t: "2026-07-20T00:00:00.000Z", avg: 2, min: 2, max: 2, sum: null },
        ],
      };

      expect(buildXLabels(dayResponse)).toEqual(["01/07", "20/07"]);
    });
  });
});

describe("ChartsSection (integração RTL + MSW)", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/");
  });

  afterEach(() => {
    window.history.pushState(null, "", "/");
  });

  it("renderiza o PeriodSelector com 24h ativo por padrão e um ChartCard por métrica", async () => {
    render(<ChartsSection />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: "Últimas 24h" })).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByText("Temperatura")).toBeInTheDocument();
    expect(screen.getByText("Umidade")).toBeInTheDocument();
    expect(screen.getByText("Pressão")).toBeInTheDocument();
    expect(screen.getByText("Chuva")).toBeInTheDocument();
    expect(screen.getByText("Índice UV")).toBeInTheDocument();
  });

  it("lê o range inicial de ?range=7d na URL (fonte única compartilhável)", () => {
    window.history.pushState(null, "", "/?range=7d");

    render(<ChartsSection />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: "7 dias" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Últimas 24h" })).toHaveAttribute("aria-pressed", "false");
  });

  it("trocar o período no PeriodSelector atualiza a URL e dispara refetch de /series com o novo range", async () => {
    const requestedRanges: string[] = [];
    server.use(
      http.get("/api/v1/readings/series", ({ request }) => {
        const url = new URL(request.url);
        const metric = url.searchParams.get("metric");
        const range = url.searchParams.get("range") ?? "";
        if (metric === "temperature_c") {
          requestedRanges.push(range);
        }
        const fixture = metric === "rain_mm" ? rainSeriesFixture : seriesFixture;
        return HttpResponse.json({ ...fixture, metric, range });
      }),
    );

    render(<ChartsSection />, { wrapper: createWrapper() });

    await waitFor(() => expect(requestedRanges).toContain("24h"));

    fireEvent.click(screen.getByRole("button", { name: "7 dias" }));

    await waitFor(() => expect(requestedRanges).toContain("7d"));
    expect(window.location.search).toBe("?range=7d");
    expect(screen.getByRole("button", { name: "7 dias" })).toHaveAttribute("aria-pressed", "true");
  });

  it("chuva é desenhada em barras (não linha) usando os valores de sum", async () => {
    server.use(
      http.get("/api/v1/readings/series", ({ request }) => {
        const metric = new URL(request.url).searchParams.get("metric");
        return HttpResponse.json(metric === "rain_mm" ? rainSeriesFixture : seriesFixture);
      }),
    );

    render(<ChartsSection />, { wrapper: createWrapper() });

    const rainCard = (await screen.findByText("Chuva")).closest('[data-testid="chartcard"]');
    expect(rainCard).not.toBeNull();

    // O card nasce com EmptyState (query ainda sem dado) e troca para o svg
    // assim que o fetch resolve — espera a troca em vez de olhar a primeira
    // renderização.
    await waitFor(() => {
      expect(rainCard!.querySelector('[data-testid="chart-svg"]')).not.toBeNull();
    });

    const svg = rainCard!.querySelector('[data-testid="chart-svg"]')!;
    expect(svg.querySelectorAll("rect")).toHaveLength(2);
    expect(svg.querySelectorAll("polyline")).toHaveLength(0);
  });

  it("período sem dados (buckets: []) mostra o EmptyState de F5 dentro de cada ChartCard vazio", async () => {
    server.use(http.get("/api/v1/readings/series", () => HttpResponse.json(emptySeriesFixture)));

    render(<ChartsSection />, { wrapper: createWrapper() });

    const emptyMessages = await screen.findAllByText("Nenhum dado no período");
    // 5 métricas, todas sem dado no período selecionado.
    expect(emptyMessages).toHaveLength(5);
  });
});
