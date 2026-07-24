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
  bucketsToPointLabels,
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

    it("range='7d' (feedback do usuário, 2026-07-24): um marcador por dia, não só primeiro/último bucket", () => {
      // 7d é bucket='hour' na API (RANGE_CONFIG, api/src/services/readings-service.ts)
      // — 3 dias distintos aqui, 2 buckets/dia, pra provar que dedupa por dia.
      const sevenDayResponse = {
        ...seriesFixture,
        range: "7d" as const,
        bucket: "hour" as const,
        buckets: [
          { t: "2026-07-18T20:00:00.000Z", avg: 1, min: 1, max: 1, sum: null },
          { t: "2026-07-18T23:00:00.000Z", avg: 2, min: 2, max: 2, sum: null },
          { t: "2026-07-19T05:00:00.000Z", avg: 3, min: 3, max: 3, sum: null },
          { t: "2026-07-19T18:00:00.000Z", avg: 4, min: 4, max: 4, sum: null },
          { t: "2026-07-20T09:00:00.000Z", avg: 5, min: 5, max: 5, sum: null },
        ],
      };

      expect(buildXLabels(sevenDayResponse)).toEqual(["18/07", "19/07", "20/07"]);
    });

    it("range='24h' continua usando só o par primeiro/último, mesmo com muitos buckets do mesmo dia", () => {
      expect(buildXLabels(seriesFixture)).toEqual(["13:00", "14:00"]);
    });
  });

  describe("bucketsToPointLabels", () => {
    it("um rótulo POR bucket (não só os extremos, diferente de buildXLabels)", () => {
      expect(bucketsToPointLabels(seriesFixture, "avg")).toEqual(["13:00", "14:00"]);
    });

    it("alinhado com bucketsToLineSeries: buckets com avg=null são pulados dos dois arrays juntos", () => {
      const withGap = {
        ...seriesFixture,
        buckets: [
          { t: "2026-07-23T13:00:00.000Z", avg: 24.1, min: 23.6, max: 24.8, sum: null },
          { t: "2026-07-23T14:00:00.000Z", avg: null, min: null, max: null, sum: null },
          { t: "2026-07-23T15:00:00.000Z", avg: 24.7, min: 24.0, max: 25.1, sum: null },
        ],
      };

      expect(bucketsToPointLabels(withGap, "avg")).toEqual(["13:00", "15:00"]);
      expect(bucketsToLineSeries(withGap, "Temperatura", "#f97316")).toEqual([
        { label: "Temperatura", color: "#f97316", points: [24.1, 24.7] },
      ]);
    });

    it("field='sum' (chuva): usa o mesmo campo de bucketsToBarSeries", () => {
      expect(bucketsToPointLabels(rainSeriesFixture, "sum")).toEqual(["13:00", "14:00"]);
    });

    it("response undefined retorna []", () => {
      expect(bucketsToPointLabels(undefined, "avg")).toEqual([]);
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

    // T6.4: cada card nasce como `ChartCardSkeleton` (`isPending`, sem dado
    // em cache ainda, `data-testid="chartcard-skeleton"`) e só vira o
    // `ChartCard` real (`data-testid="chartcard"`) quando o fetch resolve.
    // Espera os 5 `chartcard` REAIS existirem antes de procurar o de Chuva
    // especificamente — checar só o de Chuva isolado seria frágil aqui.
    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(5));

    const rainCard = screen.getByText("Chuva").closest('[data-testid="chartcard"]')!;
    const svg = rainCard.querySelector('[data-testid="chart-svg"]')!;
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

  it("T6.4: mostra skeleton por gráfico durante o carregamento inicial (sem dado em cache ainda)", () => {
    render(<ChartsSection />, { wrapper: createWrapper() });

    // Sem `await`/`waitFor` de propósito — o instante síncrono pós-render
    // (antes do MSW resolver) é exatamente o que este teste cobre.
    expect(screen.getAllByTestId("chartcard-skeleton")).toHaveLength(5);
    expect(screen.queryAllByTestId("chartcard")).toHaveLength(0);
  });

  it("T6.4/UI-09: grid de gráficos é responsivo (1 coluna mobile, 2 no breakpoint md:)", async () => {
    render(<ChartsSection />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(5));

    const grid = screen.getAllByTestId("chartcard")[0]!.parentElement!;
    expect(grid).toHaveClass("grid", "grid-cols-1", "md:grid-cols-2");
  });

  it("T6.4/UI-10: erro numa atualização em segundo plano mantém os gráficos com o último dado e mostra o banner 'reconectando'", async () => {
    // `placeholderData: keepPreviousData` só cobre o intervalo de LOADING ao
    // trocar de queryKey (range/metric) — uma vez que a NOVA key falha de
    // vez, `data` volta a `undefined` (comportamento padrão do React Query:
    // placeholder não sobrevive a um `status: 'error'` definitivo de uma key
    // que nunca teve sucesso). O "nunca tela branca" de UI-10 para uma query
    // que JÁ teve sucesso é o cache normal (mesma `queryKey`, sem precisar
    // de `keepPreviousData` — mesma decisão já documentada em `useLatest.ts`)
    // — por isso este teste refaz a MESMA `range=24h` já bem-sucedida (não
    // troca de período), igual ao cenário real de "a atualização seguinte
    // falhou" (aqui forçado via `client.refetchQueries`, já que `ChartsSection`
    // não faz polling automático de séries, diferente de `useLatest`).
    const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    render(<ChartsSection />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(5));

    server.use(http.get("/api/v1/readings/series", () => new HttpResponse(null, { status: 500 })));
    await client.refetchQueries({ queryKey: ["readings", "series"] }).catch(() => {});

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByText(/reconectando/i)).toBeInTheDocument();
    // Nunca tela branca: os 5 gráficos (com o dado de 24h já carregado) continuam visíveis.
    expect(screen.getAllByTestId("chartcard")).toHaveLength(5);
  });
});
