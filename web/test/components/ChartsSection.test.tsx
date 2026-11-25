import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import {
  COMPARISON_PAIRS,
  ChartsSection,
  METRIC_BOUNDS,
  bucketsToBarSeries,
  bucketsToLineSeries,
  bucketsToPoints,
  bucketsToTotalSeries,
  readingsToDotSeries,
  seriesDomain,
} from "../../src/components/ChartsSection";
import type { HistoryReading } from "../../src/api-client";
import {
  emptyHistoryFixture,
  emptySeriesFixture,
  historyFixture,
  rainSeriesFixture,
  seriesFixture,
} from "../fixtures/readings";

/**
 * Rótulos de tempo usam o fuso LOCAL do cliente — fixa o processo em UTC
 * para os asserts ficarem determinísticos em qualquer máquina/CI.
 */
let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
  return () => {
    process.env.TZ = originalTZ;
  };
});

/**
 * O jsdom não tem layout: o `ResponsiveContainer` do Recharts lê
 * `getBoundingClientRect()` e, com 0x0, não desenha nada. Finge 320x200 pra
 * todo elemento HTML menos `<span>` (onde o Recharts mede o texto dos ticks).
 */
const CHART_RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 320,
  bottom: 200,
  width: 320,
  height: 200,
  toJSON: () => ({}),
} as DOMRect;

beforeEach(() => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.tagName === "SPAN" ? original.call(this) : CHART_RECT;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 6 cards de métrica única + 3 pares × (linhas + pontos). */
const TOTAL_CARDS = 12;

/** Card cujo gráfico tem exatamente este rótulo acessível (os 2 cards de um par têm o mesmo título). */
function chartCardByChart(name: string): HTMLElement {
  return screen.getByRole("img", { name }).closest<HTMLElement>('[data-testid="chartcard"]')!;
}

function chartCardByTitle(title: string): HTMLElement {
  return screen
    .getByRole("heading", { name: title, level: 3 })
    .closest<HTMLElement>('[data-testid="chartcard"]')!;
}

function yAxisTicks(card: HTMLElement): string[][] {
  return Array.from(card.querySelectorAll(".recharts-yAxis-tick-labels")).map((axis) =>
    Array.from(axis.querySelectorAll("text")).map((text) => text.textContent ?? ""),
  );
}

async function hoverAt(card: HTMLElement, clientX: number): Promise<HTMLElement> {
  fireEvent.mouseMove(card.querySelector(".recharts-wrapper")!, { clientX, clientY: 50 });
  const tooltip = card.querySelector<HTMLElement>(".recharts-tooltip-wrapper")!;
  await waitFor(() => expect(tooltip).toBeVisible());
  return tooltip;
}

function createWrapper() {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Responde `/series` com a fixture certa por métrica (chuva tem `sum`). */
function seriesByMetric() {
  return http.get("/api/v1/readings/series", ({ request }) => {
    const metric = new URL(request.url).searchParams.get("metric");
    return HttpResponse.json(metric === "rain_mm" ? rainSeriesFixture : seriesFixture);
  });
}

const T13 = Date.parse("2026-07-23T13:00:00.000Z");
const T14 = Date.parse("2026-07-23T14:00:00.000Z");

describe("funções puras de ChartsSection", () => {
  describe("bucketsToPoints", () => {
    it("um ponto por bucket, no instante do bucket, com avg (default) ou sum", () => {
      expect(bucketsToPoints(seriesFixture)).toEqual([
        { t: T13, v: 24.1 },
        { t: T14, v: 24.7 },
      ]);
      expect(bucketsToPoints(rainSeriesFixture, "sum")).toEqual([
        { t: T13, v: 0.4 },
        { t: T14, v: 0.1 },
      ]);
    });

    it("bucket sem valor vira null (buraco), nunca some do eixo", () => {
      const response = {
        ...seriesFixture,
        buckets: [{ t: "2026-07-23T13:00:00.000Z", avg: null, min: null, max: null, sum: null }],
      };
      expect(bucketsToPoints(response)).toEqual([{ t: T13, v: null }]);
    });

    it("sem resposta → []", () => {
      expect(bucketsToPoints(undefined)).toEqual([]);
    });
  });

  describe("bucketsToLineSeries", () => {
    it("monta 1 série com os pontos no tempo, unidade e limites opcionais", () => {
      expect(
        bucketsToLineSeries(seriesFixture, "Umidade", "blue", {
          unit: "%",
          bounds: { min: 0, max: 100 },
        }),
      ).toEqual([
        {
          label: "Umidade",
          color: "blue",
          unit: "%",
          bounds: { min: 0, max: 100 },
          points: [
            { t: T13, v: 24.1 },
            { t: T14, v: 24.7 },
          ],
        },
      ]);
    });

    it("sem nenhum valor (buckets vazios ou todos null) → [] (EmptyState)", () => {
      expect(bucketsToLineSeries(emptySeriesFixture, "T", "red")).toEqual([]);
      expect(bucketsToLineSeries(rainSeriesFixture, "T", "red", { field: "sum" })).toHaveLength(1);
      expect(bucketsToLineSeries(undefined, "T", "red")).toEqual([]);
    });
  });

  describe("bucketsToBarSeries", () => {
    it("usa o sum (volume do bucket), não o avg", () => {
      expect(bucketsToBarSeries(rainSeriesFixture, "Chuva", "cyan")[0]!.points).toEqual([
        { t: T13, v: 0.4 },
        { t: T14, v: 0.1 },
      ]);
    });

    it("métrica sem sum → []", () => {
      expect(bucketsToBarSeries(seriesFixture, "Chuva", "cyan")).toEqual([]);
    });
  });

  describe("bucketsToTotalSeries (Chuva Acumulada — barra única)", () => {
    it("soma o sum de TODOS os buckets em UM ponto, sem resíduo de float (0.4 + 0.1 = 0.5)", () => {
      const [series] = bucketsToTotalSeries(rainSeriesFixture, "Chuva", "cyan");
      expect(series!.points).toHaveLength(1);
      expect(series!.points[0]!.v).toBe(0.5);
    });

    it("período sem chuva (sum=0) é uma barra de 0 mm, não um card vazio", () => {
      const dry = {
        ...rainSeriesFixture,
        buckets: rainSeriesFixture.buckets.map((bucket) => ({ ...bucket, sum: 0 })),
      };
      expect(bucketsToTotalSeries(dry, "Chuva", "cyan")[0]!.points[0]!.v).toBe(0);
    });

    it("sem resposta ou sem sum → []", () => {
      expect(bucketsToTotalSeries(undefined, "Chuva", "cyan")).toEqual([]);
      expect(bucketsToTotalSeries(seriesFixture, "Chuva", "cyan")).toEqual([]);
    });
  });

  describe("seriesDomain", () => {
    it("é a janela consultada pela API (from/to), não a extensão dos dados", () => {
      expect(seriesDomain(seriesFixture)).toEqual([
        Date.parse(seriesFixture.from),
        Date.parse(seriesFixture.to),
      ]);
    });

    it("sem resposta → undefined", () => {
      expect(seriesDomain(undefined)).toBeUndefined();
    });
  });

  describe("readingsToDotSeries (leituras brutas → pontos no tempo)", () => {
    const reading = (minute: number, temperature: number | null): HistoryReading => ({
      timestamp: new Date(T13 + minute * 60_000).toISOString(),
      temperature_c: temperature,
      humidity_pct: 50,
      pressure_hpa: 1010,
      rain_mm: 0,
      uv_index: null,
    });

    it("um ponto por leitura com valor, no instante da leitura", () => {
      const { series, stride } = readingsToDotSeries(
        [reading(0, 20), reading(15, null), reading(30, 21)],
        "temperature_c",
        { label: "Temperatura", color: "orange", unit: "°C" },
      );

      expect(stride).toBe(1);
      expect(series[0]!.points).toEqual([
        { t: T13, v: 20 },
        { t: T13 + 30 * 60_000, v: 21 },
      ]);
    });

    it("acima do teto, mantém 1 a cada N leituras (amostragem por passo: valores reais, sem média)", () => {
      const readings = Array.from({ length: 10 }, (_, index) => reading(index * 15, index));
      const { series, stride } = readingsToDotSeries(
        readings,
        "temperature_c",
        { label: "T", color: "orange", unit: "°C" },
        4,
      );

      expect(stride).toBe(3);
      expect(series[0]!.points.map((point) => point.v)).toEqual([0, 3, 6, 9]);
    });

    it("umidade leva os limites físicos [0, 100]", () => {
      const { series } = readingsToDotSeries([reading(0, 20)], "humidity_pct", {
        label: "Umidade",
        color: "blue",
        unit: "%",
      });
      expect(series[0]!.bounds).toEqual(METRIC_BOUNDS.humidity_pct);
    });

    it("sem nenhum valor → nenhuma série", () => {
      expect(
        readingsToDotSeries([reading(0, null)], "temperature_c", {
          label: "T",
          color: "orange",
          unit: "°C",
        }).series,
      ).toEqual([]);
    });
  });

  it("COMPARISON_PAIRS: Temperatura/Umidade, Temperatura/Pressão e Umidade/Pressão", () => {
    expect(COMPARISON_PAIRS.map((pair) => pair.title)).toEqual([
      "Temperatura e Umidade",
      "Temperatura e Pressão",
      "Umidade e Pressão",
    ]);
  });
});

describe("ChartsSection (integração RTL + MSW)", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/");
  });

  afterEach(() => {
    window.history.pushState(null, "", "/");
  });

  it("renderiza o seletor (24h ativo por padrão, com 'Personalizado') e um card por métrica", async () => {
    render(<ChartsSection />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: "Últimas 24h" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Personalizado" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    for (const title of [
      "Temperatura",
      "Umidade",
      "Pressão",
      "Chuva (Distribuição)",
      "Chuva (Acumulada)",
      "Índice UV",
    ]) {
      expect(screen.getByRole("heading", { name: title, level: 3 })).toBeInTheDocument();
    }
  });

  it("lê o período inicial de ?range=7d na URL", () => {
    window.history.pushState(null, "", "/?range=7d");

    render(<ChartsSection />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: "7 dias" })).toHaveAttribute("aria-pressed", "true");
  });

  it("trocar o preset atualiza a URL e busca /series com o novo range", async () => {
    const requestedRanges: string[] = [];
    server.use(
      http.get("/api/v1/readings/series", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("metric") === "temperature_c") {
          requestedRanges.push(url.searchParams.get("range") ?? "");
        }
        return HttpResponse.json(seriesFixture);
      }),
    );

    render(<ChartsSection />, { wrapper: createWrapper() });
    await waitFor(() => expect(requestedRanges).toContain("24h"));

    fireEvent.click(screen.getByRole("button", { name: "7 dias" }));

    await waitFor(() => expect(requestedRanges).toContain("7d"));
    expect(window.location.search).toBe("?range=7d");
  });

  describe("período personalizado (pedido do usuário, 2026-11-24)", () => {
    const fixedNow = () => new Date("2026-07-23T14:30:00.000Z");

    function dayButton(day: string): HTMLButtonElement {
      const button = document.querySelector<HTMLButtonElement>(`[data-day="${day}"]`);
      if (!button) throw new Error(`Dia ${day} não está visível no calendário`);
      return button;
    }

    it("'Personalizado' abre o calendário; 'Aplicar' busca /series com from/to e grava na URL", async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get("/api/v1/readings/series", ({ request }) => {
          const params = new URL(request.url).searchParams;
          if (params.get("metric") === "temperature_c") requests.push(params);
          return HttpResponse.json(seriesFixture);
        }),
      );

      render(<ChartsSection now={fixedNow} />, { wrapper: createWrapper() });
      fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));

      fireEvent.click(dayButton("01/07/2026"));
      fireEvent.click(dayButton("10/07/2026"));
      fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

      await waitFor(() =>
        expect(requests.some((params) => params.get("from") === "2026-07-01T00:00:00.000Z")).toBe(
          true,
        ),
      );
      const custom = requests.find((params) => params.has("from"))!;
      expect(custom.get("to")).toBe("2026-07-10T23:59:59.999Z");
      expect(custom.has("range")).toBe(false);

      const search = new URLSearchParams(window.location.search);
      expect(search.get("range")).toBe("custom");
      expect(search.get("from")).toBe("2026-07-01T00:00:00.000Z");
      expect(screen.getByRole("button", { name: "Personalizado" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "01/07/2026 – 10/07/2026" })).toBeInTheDocument();
    });

    it("intervalo acima de 3 meses: mostra o erro e não aplica", () => {
      render(<ChartsSection now={fixedNow} />, { wrapper: createWrapper() });
      fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));

      // Navega até abril pelo dropdown de mês do calendário.
      const monthSelect = screen.getAllByRole("combobox")[0]!;
      fireEvent.change(monthSelect, { target: { value: "3" } });
      fireEvent.click(dayButton("01/04/2026"));
      fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "6" } });
      fireEvent.click(dayButton("10/07/2026"));
      fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "O intervalo não pode ser maior que 3 meses.",
      );
      expect(new URLSearchParams(window.location.search).get("range")).not.toBe("custom");
    });

    it("fechar o calendário sem aplicar volta o seletor ao período em vigor", () => {
      render(<ChartsSection now={fixedNow} />, { wrapper: createWrapper() });
      fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

      expect(screen.getByRole("button", { name: "Últimas 24h" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("lê ?range=custom&from&to da URL (recarregar a página mantém o intervalo)", async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get("/api/v1/readings/series", ({ request }) => {
          requests.push(new URL(request.url).searchParams);
          return HttpResponse.json(seriesFixture);
        }),
      );
      window.history.pushState(
        null,
        "",
        "/?range=custom&from=2026-07-01T00:00:00.000Z&to=2026-07-10T23:59:59.999Z",
      );

      render(<ChartsSection now={fixedNow} />, { wrapper: createWrapper() });

      expect(screen.getByRole("button", { name: "Personalizado" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "01/07/2026 – 10/07/2026" })).toBeInTheDocument();
      await waitFor(() => expect(requests.length).toBeGreaterThan(0));
      expect(requests[0]!.get("from")).toBe("2026-07-01T00:00:00.000Z");
    });
  });

  it("Chuva (Distribuição): barras no tempo com o sum de cada bucket", async () => {
    server.use(seriesByMetric());

    render(<ChartsSection />, { wrapper: createWrapper() });
    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));

    const rainCard = chartCardByTitle("Chuva (Distribuição)");
    expect(
      within(rainCard).getByRole("img", { name: "Gráfico de barras: Chuva (Distribuição)" }),
    ).toBeInTheDocument();
    expect(rainCard.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2);
  });

  it("Chuva (Acumulada): UMA barra com o total do período, rotulada com a janela", async () => {
    server.use(seriesByMetric());

    render(<ChartsSection />, { wrapper: createWrapper() });
    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));

    const card = chartCardByTitle("Chuva (Acumulada)");
    expect(card.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(1);
    const tooltip = await hoverAt(card, 180);
    expect(tooltip).toHaveTextContent("Últimas 24h");
    expect(tooltip).toHaveTextContent("Chuva (Acumulada)0,5mm");
  });

  it("Chuva (Acumulada) em 7 dias rotula 'Últimos 7 dias'", async () => {
    window.history.pushState(null, "", "/?range=7d");
    server.use(seriesByMetric());

    render(<ChartsSection />, { wrapper: createWrapper() });
    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));

    const tooltip = await hoverAt(chartCardByTitle("Chuva (Acumulada)"), 180);
    expect(tooltip).toHaveTextContent("Últimos 7 dias");
  });

  it("período sem dados mostra o EmptyState em todos os cards", async () => {
    server.use(
      http.get("/api/v1/readings/series", () => HttpResponse.json(emptySeriesFixture)),
      http.get("/api/v1/readings", () => HttpResponse.json(emptyHistoryFixture)),
    );

    render(<ChartsSection />, { wrapper: createWrapper() });

    await waitFor(() =>
      expect(screen.getAllByText("Nenhum dado no período")).toHaveLength(TOTAL_CARDS),
    );
  });

  it("mostra skeleton em todos os cards durante o carregamento inicial", () => {
    render(<ChartsSection />, { wrapper: createWrapper() });

    expect(screen.getAllByTestId("chartcard-skeleton")).toHaveLength(TOTAL_CARDS);
    expect(screen.queryAllByTestId("chartcard")).toHaveLength(0);
  });

  it("grid responsivo (1 coluna mobile, 2 no md:, 3 no xl:)", async () => {
    render(<ChartsSection />, { wrapper: createWrapper() });
    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));

    const grid = screen.getAllByTestId("chartcard")[0]!.parentElement!;
    expect(grid).toHaveClass("grid", "grid-cols-1", "md:grid-cols-2", "xl:grid-cols-3");
  });

  it("erro numa atualização em segundo plano mantém os gráficos e mostra o banner 'reconectando'", async () => {
    const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    render(<ChartsSection />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));

    server.use(http.get("/api/v1/readings/series", () => new HttpResponse(null, { status: 500 })));
    await client.refetchQueries({ queryKey: ["readings", "series"] }).catch(() => {});

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByText(/reconectando/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS);
  });

  describe("Comparativos (pedido do usuário, 2026-11-24: tudo ao longo do tempo)", () => {
    it("3 colunas, cada uma com as médias em linhas e as leituras em pontos", async () => {
      render(<ChartsSection />, { wrapper: createWrapper() });
      await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));

      const columns = screen.getAllByTestId("comparison-column");
      expect(columns).toHaveLength(3);
      expect(columns[0]!.parentElement).toHaveClass("md:grid-cols-2", "xl:grid-cols-3");

      const titlesOf = (column: HTMLElement) =>
        within(column)
          .getAllByRole("heading", { level: 3 })
          .map((heading) => heading.textContent);
      expect(titlesOf(columns[0]!)).toEqual(["Temperatura e Umidade", "Temperatura e Umidade"]);
      expect(titlesOf(columns[1]!)).toEqual(["Temperatura e Pressão", "Temperatura e Pressão"]);
      expect(titlesOf(columns[2]!)).toEqual(["Umidade e Pressão", "Umidade e Pressão"]);
      const kinds = within(columns[0]!)
        .getAllByRole("img")
        .map((chart) => chart.getAttribute("aria-label"));
      expect(kinds).toEqual([
        "Gráfico de linha: Temperatura e Umidade",
        "Gráfico de pontos: Temperatura e Umidade",
      ]);
    });

    it("as linhas reaproveitam as 5 queries de série; os pontos vêm das leituras brutas da MESMA janela", async () => {
      let seriesCalls = 0;
      const rawRequests: URLSearchParams[] = [];
      server.use(
        http.get("/api/v1/readings/series", ({ request }) => {
          seriesCalls += 1;
          const metric = new URL(request.url).searchParams.get("metric");
          return HttpResponse.json(metric === "rain_mm" ? rainSeriesFixture : seriesFixture);
        }),
        http.get("/api/v1/readings", ({ request }) => {
          rawRequests.push(new URL(request.url).searchParams);
          return HttpResponse.json(historyFixture);
        }),
      );

      render(<ChartsSection />, { wrapper: createWrapper() });
      await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));

      expect(seriesCalls).toBe(5);
      expect(rawRequests).toHaveLength(1);
      expect(rawRequests[0]!.get("from")).toBe(seriesFixture.from);
      expect(rawRequests[0]!.get("to")).toBe(seriesFixture.to);
      expect(rawRequests[0]!.get("order")).toBe("asc");
    });

    it("card de leituras: um ponto por leitura de cada grandeza, sem área", async () => {
      render(<ChartsSection />, { wrapper: createWrapper() });
      await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));

      const card = chartCardByChart("Gráfico de pontos: Temperatura e Umidade");
      // historyFixture: 2 leituras, cada uma com temperatura e umidade.
      expect(card.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(4);
      expect(card.querySelectorAll(".recharts-area")).toHaveLength(0);
    });

    it("par com unidades diferentes (°C × hPa): um eixo Y por série, cada um com sua unidade", async () => {
      server.use(seriesByMetric());

      render(<ChartsSection />, { wrapper: createWrapper() });
      await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));

      const card = chartCardByChart("Gráfico de linha: Temperatura e Pressão");
      expect(card.querySelectorAll(".recharts-area")).toHaveLength(2);
      const axes = yAxisTicks(card);
      expect(axes).toHaveLength(2);
      axes[0]!.forEach((tick) => expect(tick).toMatch(/°C$/));
      axes[1]!.forEach((tick) => expect(tick).toMatch(/hPa$/));
    });

    it("acima de 1 dia (7d): os pontos são as MESMAS médias por hora das linhas, sem buscar leituras brutas", async () => {
      window.history.replaceState(null, "", "/?range=7d");
      const week = {
        ...seriesFixture,
        range: "7d" as const,
        from: "2026-07-16T15:00:00.000Z",
        to: "2026-07-23T15:00:00.000Z",
      };
      let rawCalls = 0;
      server.use(
        http.get("/api/v1/readings/series", ({ request }) => {
          const metric = new URL(request.url).searchParams.get("metric");
          return HttpResponse.json(metric === "rain_mm" ? { ...rainSeriesFixture, ...week } : week);
        }),
        http.get("/api/v1/readings", () => {
          rawCalls += 1;
          return HttpResponse.json(historyFixture);
        }),
      );

      render(<ChartsSection />, { wrapper: createWrapper() });
      await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));

      // seriesFixture: 2 buckets de hora × 2 grandezas = 4 pontos (não as leituras).
      const card = chartCardByChart("Gráfico de pontos: Temperatura e Umidade");
      expect(card.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(4);
      expect(rawCalls).toBe(0);
      window.history.replaceState(null, "", "/");
    });

    it("falha ao buscar as leituras brutas: card de pontos vazio, não skeleton eterno", async () => {
      server.use(http.get("/api/v1/readings", () => new HttpResponse(null, { status: 500 })));

      render(<ChartsSection />, { wrapper: createWrapper() });

      await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(TOTAL_CARDS));
      const card = screen
        .getAllByRole("heading", { name: "Umidade e Pressão", level: 3 })[1]!
        .closest<HTMLElement>('[data-testid="chartcard"]')!;
      expect(within(card).getByText("Nenhum dado no período")).toBeInTheDocument();
    });
  });
});
