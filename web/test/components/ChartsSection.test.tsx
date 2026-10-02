import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
  scatterPoints,
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

/**
 * O jsdom não tem layout: o `ResponsiveContainer` do Recharts (dentro do
 * `ChartCard`) lê `getBoundingClientRect()` ao montar e, com 0x0, não desenha
 * nada. Finge 320x200 pra todo elemento HTML menos `<span>` (onde o Recharts
 * mede o texto dos ticks — 320x200 ali faria os rótulos "colidirem").
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

/** `ChartCard` real (não skeleton) cujo título é exatamente `title`. */
function chartCardByTitle(title: string): HTMLElement {
  return screen
    .getByRole("heading", { name: title, level: 3 })
    .closest<HTMLElement>('[data-testid="chartcard"]')!;
}

/** Rótulos dos ticks de cada eixo Y do card (esquerdo, direito). */
function yAxisTicks(card: HTMLElement): string[][] {
  return Array.from(card.querySelectorAll(".recharts-yAxis-tick-labels")).map((axis) =>
    Array.from(axis.querySelectorAll("text")).map((text) => text.textContent ?? ""),
  );
}

/**
 * Passa o mouse perto do 1º ponto do card e espera o tooltip do Recharts
 * (atualizado num requestAnimationFrame, daí o `waitFor`).
 */
async function hoverFirstPoint(card: HTMLElement): Promise<HTMLElement> {
  fireEvent.mouseMove(card.querySelector(".recharts-wrapper")!, { clientX: 50, clientY: 50 });
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

    it("field='sum' (pedido do usuário, 2026-08-16: Chuva virou linha, mas continua acumulada) mapeia sum, não avg", () => {
      const series = bucketsToLineSeries(rainSeriesFixture, "Chuva", "#06b6d4", undefined, "sum");

      // Mesmos valores de `bucketsToBarSeries` (sum: 0.4, 0.1) — só o traço visual mudou de barra pra linha.
      expect(series).toEqual([{ label: "Chuva", color: "#06b6d4", points: [0.4, 0.1] }]);
    });

    it("sem field (default 'avg') continua mapeando avg mesmo pra rainSeriesFixture", () => {
      const series = bucketsToLineSeries(rainSeriesFixture, "Chuva (média)", "#06b6d4");

      expect(series).toEqual([{ label: "Chuva (média)", color: "#06b6d4", points: [0.1, 0.05] }]);
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

    it("bucket='day' mantém o dia UTC do bucket mesmo com o processo em fuso local negativo (regressão: chuva em 30d aparecia com data D-1)", () => {
      // date_trunc('day', ...) roda em UTC (api/src/db/client.ts força
      // timezone=UTC na sessão) — o bucket abaixo é meia-noite UTC de 04/08,
      // que em fuso local UTC-3 seria 03/08 21:00 se reinterpretado. O rótulo
      // deve continuar "04/08": o bucket já É o dia calendário UTC.
      const previousTZ = process.env.TZ;
      process.env.TZ = "America/Sao_Paulo";
      try {
        const dayResponse = {
          ...seriesFixture,
          bucket: "day" as const,
          buckets: [{ t: "2026-08-04T00:00:00.000Z", avg: 24.65, min: 23.9, max: 25.1, sum: null }],
        };

        expect(buildXLabels(dayResponse)).toEqual(["04/08"]);
      } finally {
        process.env.TZ = previousTZ;
      }
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

  describe("scatterPoints (dispersão — pedido do usuário, 2026-10-02)", () => {
    it("pareia y (temperatura) e x (umidade) pelo t do bucket, com o rótulo de tempo do ponto", () => {
      const humidity = {
        ...seriesFixture,
        metric: "humidity_pct" as const,
        buckets: [
          { t: "2026-07-23T13:00:00.000Z", avg: 60, min: 58, max: 62, sum: null },
          { t: "2026-07-23T14:00:00.000Z", avg: 65, min: 63, max: 67, sum: null },
        ],
      };

      expect(scatterPoints(seriesFixture, humidity)).toEqual([
        { x: 60, y: 24.1, label: "13:00" },
        { x: 65, y: 24.7, label: "14:00" },
      ]);
    });

    it("só entram buckets em que as DUAS métricas têm avg — gap ou horário ausente em uma delas nunca desalinha os pares", () => {
      const temperature = {
        ...seriesFixture,
        buckets: [
          { t: "2026-07-23T13:00:00.000Z", avg: 24.1, min: null, max: null, sum: null },
          { t: "2026-07-23T14:00:00.000Z", avg: null, min: null, max: null, sum: null },
          { t: "2026-07-23T15:00:00.000Z", avg: 25.0, min: null, max: null, sum: null },
          { t: "2026-07-23T16:00:00.000Z", avg: 25.5, min: null, max: null, sum: null },
        ],
      };
      const pressure = {
        ...seriesFixture,
        metric: "pressure_hpa" as const,
        buckets: [
          { t: "2026-07-23T13:00:00.000Z", avg: 1012, min: null, max: null, sum: null },
          { t: "2026-07-23T14:00:00.000Z", avg: 1013, min: null, max: null, sum: null },
          { t: "2026-07-23T16:00:00.000Z", avg: 1015, min: null, max: null, sum: null },
        ],
      };

      expect(scatterPoints(temperature, pressure)).toEqual([
        { x: 1012, y: 24.1, label: "13:00" },
        { x: 1015, y: 25.5, label: "16:00" },
      ]);
    });

    it("resposta ausente (query sem dado) → []", () => {
      expect(scatterPoints(undefined, seriesFixture)).toEqual([]);
      expect(scatterPoints(seriesFixture, undefined)).toEqual([]);
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

    it("range='7d' (feedback do usuário, 2026-07-24): rótulo dia+hora, não só hora (ambíguo numa janela de 7 dias)", () => {
      const sevenDayResponse = {
        ...seriesFixture,
        range: "7d" as const,
        bucket: "hour" as const,
        buckets: [
          { t: "2026-07-18T20:00:00.000Z", avg: 1, min: 1, max: 1, sum: null },
          { t: "2026-07-19T05:00:00.000Z", avg: null, min: null, max: null, sum: null },
          { t: "2026-07-20T09:00:00.000Z", avg: 3, min: 3, max: 3, sum: null },
        ],
      };

      // Bucket do meio (avg=null) é pulado — mesma regra de alinhamento de sempre.
      expect(bucketsToPointLabels(sevenDayResponse, "avg")).toEqual(["18/07 20:00", "20/07 09:00"]);
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

    expect(screen.getByRole("button", { name: "Últimas 24h" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

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
    expect(screen.getByRole("button", { name: "Últimas 24h" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
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

  it("chuva é desenhada em LINHA (não barras, pedido do usuário 2026-08-16 — consistência visual com os outros cards), usando os valores de sum (acumulada, não uma média)", async () => {
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
    // Espera os 7 `chartcard` REAIS existirem (5 métrica única + 2 combos,
    // ver `COMBO_CHARTS`) antes de procurar o de Chuva especificamente —
    // checar só o de Chuva isolado seria frágil aqui.
    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(7));

    const rainCard = chartCardByTitle("Chuva");
    expect(
      within(rainCard).getByRole("img", { name: "Gráfico de linha: Chuva" }),
    ).toBeInTheDocument();
    expect(rainCard.querySelectorAll(".recharts-area")).toHaveLength(1);
    expect(rainCard.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(0);

    // Tooltip com o `sum` do bucket (rainSeriesFixture: 0.4), não o `avg` (0.1).
    const tooltip = await hoverFirstPoint(rainCard);
    expect(tooltip).toHaveTextContent("13:00");
    expect(tooltip).toHaveTextContent("Chuva0.4mm");
  });

  it("período sem dados (buckets: []) mostra o EmptyState de F5 dentro de cada ChartCard vazio", async () => {
    server.use(http.get("/api/v1/readings/series", () => HttpResponse.json(emptySeriesFixture)));

    render(<ChartsSection />, { wrapper: createWrapper() });

    const emptyMessages = await screen.findAllByText("Nenhum dado no período");
    // 5 métricas + 2 combos + 2 dispersões (as métricas de cada combo/
    // dispersão também ficam vazias com este handler), todas sem dado.
    expect(emptyMessages).toHaveLength(9);
  });

  it("T6.4: mostra skeleton por gráfico durante o carregamento inicial (sem dado em cache ainda)", () => {
    render(<ChartsSection />, { wrapper: createWrapper() });

    // Sem `await`/`waitFor` de propósito — o instante síncrono pós-render
    // (antes do MSW resolver) é exatamente o que este teste cobre. 5 cards de
    // métrica única + 2 combos + 2 dispersões, todos nascem em skeleton.
    expect(screen.getAllByTestId("chartcard-skeleton")).toHaveLength(9);
    expect(screen.queryAllByTestId("chartcard")).toHaveLength(0);
  });

  it("T6.4/UI-09: grid de gráficos é responsivo (1 coluna mobile, 2 no breakpoint md:)", async () => {
    render(<ChartsSection />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(7));

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

    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(7));

    server.use(http.get("/api/v1/readings/series", () => new HttpResponse(null, { status: 500 })));
    await client.refetchQueries({ queryKey: ["readings", "series"] }).catch(() => {});

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByText(/reconectando/i)).toBeInTheDocument();
    // Nunca tela branca: os 7 gráficos (5 métrica única + 2 combos, com o
    // dado de 24h já carregado) continuam visíveis.
    expect(screen.getAllByTestId("chartcard")).toHaveLength(7);
  });

  describe("Comparativos (combos de 2 métricas — pedido do usuário do produto, 2026-07-24)", () => {
    it("renderiza os 2 cards combo com seus títulos (o combo Índice UV × Chuva foi removido em 2026-10-02), reaproveitando as MESMAS 5 queries de métrica única (sem request de rede extra)", async () => {
      let callCount = 0;
      server.use(
        http.get("/api/v1/readings/series", ({ request }) => {
          callCount += 1;
          const metric = new URL(request.url).searchParams.get("metric");
          return HttpResponse.json(metric === "rain_mm" ? rainSeriesFixture : seriesFixture);
        }),
      );

      render(<ChartsSection />, { wrapper: createWrapper() });

      await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(7));

      expect(screen.getByText("Temperatura e Umidade")).toBeInTheDocument();
      expect(screen.queryByText(/Índice UV (×|e) Chuva/)).not.toBeInTheDocument();
      expect(screen.getByText("Temperatura e Pressão")).toBeInTheDocument();

      // 5 métricas únicas — os combos reaproveitam a MESMA queryKey (mesmo
      // cache do React Query), então nenhuma requisição além das 5 originais.
      expect(callCount).toBe(5);
    });

    it("combo Temperatura e Umidade: 2 áreas, uma por métrica, cor por série", async () => {
      server.use(
        http.get("/api/v1/readings/series", ({ request }) => {
          const metric = new URL(request.url).searchParams.get("metric");
          return HttpResponse.json(metric === "rain_mm" ? rainSeriesFixture : seriesFixture);
        }),
      );

      render(<ChartsSection />, { wrapper: createWrapper() });
      await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(7));

      const card = chartCardByTitle("Temperatura e Umidade");
      expect(card.querySelectorAll(".recharts-area")).toHaveLength(2);
      const css = card.querySelector("style")!.textContent!;
      expect(css).toContain("--color-s0: var(--sensor-temperature)");
      expect(css).toContain("--color-s1: var(--sensor-humidity)");
    });

    it("combo com unidades diferentes (°C × hPa) ganha um eixo Y por série, cada um com sua unidade, e o tooltip usa a unidade de cada série", async () => {
      server.use(
        http.get("/api/v1/readings/series", ({ request }) => {
          const metric = new URL(request.url).searchParams.get("metric");
          return HttpResponse.json(metric === "rain_mm" ? rainSeriesFixture : seriesFixture);
        }),
      );

      render(<ChartsSection />, { wrapper: createWrapper() });
      await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(7));

      const card = chartCardByTitle("Temperatura e Pressão");
      const axes = yAxisTicks(card);
      expect(axes).toHaveLength(2);
      axes[0]!.forEach((tick) => expect(tick).toMatch(/°C$/));
      axes[1]!.forEach((tick) => expect(tick).toMatch(/hPa$/));

      // seriesFixture (avg 24.1 no 1º bucket) responde pelas duas métricas
      // aqui — o que importa é a unidade de cada série.
      const tooltip = await hoverFirstPoint(card);
      expect(tooltip).toHaveTextContent("Temperatura24.1°C");
      expect(tooltip).toHaveTextContent("Pressão24.1hPa");
    });
  });

  describe("Dispersão (uma grandeza em função da outra — pedido do usuário, 2026-10-02)", () => {
    const humidityFixture = {
      ...seriesFixture,
      metric: "humidity_pct" as const,
      buckets: [
        { t: "2026-07-23T13:00:00.000Z", avg: 60, min: 58, max: 62, sum: null },
        { t: "2026-07-23T14:00:00.000Z", avg: 65, min: 63, max: 67, sum: null },
      ],
    };

    function scatterCardByTitle(title: string): HTMLElement {
      return screen
        .getByRole("heading", { name: title, level: 3 })
        .closest<HTMLElement>('[data-testid="scatterchartcard"]')!;
    }

    it("Temperatura × Umidade e Temperatura × Pressão: temperatura no eixo Y, a outra grandeza no eixo X, um ponto por bucket", async () => {
      server.use(
        http.get("/api/v1/readings/series", ({ request }) => {
          const metric = new URL(request.url).searchParams.get("metric");
          if (metric === "humidity_pct") return HttpResponse.json(humidityFixture);
          return HttpResponse.json(metric === "rain_mm" ? rainSeriesFixture : seriesFixture);
        }),
      );

      render(<ChartsSection />, { wrapper: createWrapper() });
      await waitFor(() => expect(screen.getAllByTestId("scatterchartcard")).toHaveLength(2));

      const humidityCard = scatterCardByTitle("Temperatura × Umidade");
      expect(
        within(humidityCard).getByRole("img", {
          name: "Gráfico de dispersão: Temperatura × Umidade (Temperatura no eixo Y, Umidade no eixo X)",
        }),
      ).toBeInTheDocument();
      expect(humidityCard.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(2);
      const yTicks = Array.from(
        humidityCard.querySelectorAll(".recharts-yAxis-tick-labels text"),
      ).map((t) => t.textContent ?? "");
      const xTicks = Array.from(
        humidityCard.querySelectorAll(".recharts-xAxis-tick-labels text"),
      ).map((t) => t.textContent ?? "");
      expect(yTicks.length).toBeGreaterThan(0);
      expect(xTicks.length).toBeGreaterThan(0);
      yTicks.forEach((tick) => expect(tick).toMatch(/°C$/));
      xTicks.forEach((tick) => expect(tick).toMatch(/%$/));

      const pressureCard = scatterCardByTitle("Temperatura × Pressão");
      Array.from(pressureCard.querySelectorAll(".recharts-xAxis-tick-labels text")).forEach((t) =>
        expect(t.textContent).toMatch(/hPa$/),
      );
    });
  });
});
