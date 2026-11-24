import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import {
  ChartCard,
  axisLayout,
  barDomain,
  boundedDomain,
  buildRows,
  formatValue,
  paddedDomain,
} from "../../src/components/ChartCard";

/** Horários deterministas: o processo roda em UTC (ver `beforeAll`). */
let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
  return () => {
    process.env.TZ = originalTZ;
  };
});

const START = Date.UTC(2026, 6, 23, 14, 0, 0);
const HOUR = 60 * 60 * 1000;

/** Valores → pontos de hora em hora a partir de 23/07 14:00. */
function pts(values: number[]) {
  return values.map((v, index) => ({ t: START + index * HOUR, v }));
}

/**
 * O jsdom não tem layout: o `ResponsiveContainer` do Recharts lê
 * `getBoundingClientRect()` ao montar e sobrescreve o `initialDimension`
 * (320x200) do `ChartContainer` com 0x0 — nada seria desenhado. Fingimos um
 * container de 320x200 pra todo elemento HTML, MENOS `<span>`: o Recharts
 * mede o texto dos ticks num span oculto, e 320x200 ali faria todo rótulo
 * "colidir" com o vizinho (o eixo descartaria ticks).
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

/** Rótulos dos ticks de cada eixo Y, na ordem em que os eixos são desenhados (esquerdo, direito). */
function yAxisTicks(container: HTMLElement): string[][] {
  return Array.from(container.querySelectorAll(".recharts-yAxis-tick-labels")).map((axis) =>
    Array.from(axis.querySelectorAll("text")).map((text) => text.textContent ?? ""),
  );
}

/** "24,6°C" → 24.6 (tira a unidade do tick, vírgula decimal pt-BR). */
function tickNumber(tick: string): number {
  return Number.parseFloat(tick.replace(",", "."));
}

/** Área de plotagem (sem margens/eixos) — o `clipPath` que o Recharts aplica às séries. */
function plotArea(container: HTMLElement): { top: number; bottom: number } {
  const rect = container.querySelector("clipPath rect")!;
  const top = Number(rect.getAttribute("y"));
  return { top, bottom: top + Number(rect.getAttribute("height")) };
}

/** Coordenadas Y de todos os vértices de um atributo `d` de path SVG. */
function pathYs(d: string): number[] {
  return Array.from(d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g), (match) => Number(match[2]));
}

/**
 * Passa o mouse sobre o gráfico na coordenada X dada (plot vai de x=44 até
 * x=316 com um eixo, ou x=272 com dois) e espera o tooltip do Recharts
 * aparecer — ele é atualizado num requestAnimationFrame, daí o `waitFor`.
 */
async function hoverAt(container: HTMLElement, clientX: number): Promise<HTMLElement> {
  fireEvent.mouseMove(container.querySelector(".recharts-wrapper")!, { clientX, clientY: 50 });
  const tooltip = container.querySelector<HTMLElement>(".recharts-tooltip-wrapper")!;
  await waitFor(() => expect(tooltip).toBeVisible());
  return tooltip;
}

describe("helpers puros de ChartCard", () => {
  describe("formatValue", () => {
    it("arredonda para 1 casa decimal, com vírgula (pt-BR) e sem separador de milhar", () => {
      expect(formatValue(24.65)).toBe("24,7");
      expect(formatValue(1013.24)).toBe("1013,2");
    });

    it("omite o ',0' quando o valor arredondado é inteiro", () => {
      expect(formatValue(20)).toBe("20");
      expect(formatValue(19.96)).toBe("20");
    });
  });

  describe("buildRows (linhas mescladas por TEMPO, não por índice)", () => {
    it("uma linha por instante, com s0/s1 de cada série e o rótulo do instante original", () => {
      const rows = buildRows(
        [
          { label: "Temperatura", color: "#f97316", points: pts([20, 24]) },
          { label: "Umidade", color: "#0ea5e9", points: pts([60, 65]) },
        ],
        { granularity: "raw" },
      );

      expect(rows).toEqual([
        { t: START, label: "23/07 14:00", s0: 20, s1: 60 },
        { t: START + HOUR, label: "23/07 15:00", s0: 24, s1: 65 },
      ]);
    });

    it("bucket horário é posicionado no CENTRO da hora, com o rótulo do início dela", () => {
      const rows = buildRows([{ label: "T", color: "#f97316", points: pts([20]) }], {
        granularity: "hour",
      });

      expect(rows).toEqual([{ t: START + HOUR / 2, label: "23/07 14:00", s0: 20 }]);
    });

    it("série com buraco nos instantes da outra não desloca nada: cada valor fica no seu tempo", () => {
      const rows = buildRows(
        [
          { label: "Curta", color: "#f97316", points: [{ t: START + 2 * HOUR, v: 1 }] },
          { label: "Longa", color: "#0ea5e9", points: pts([1, 2, 3]) },
        ],
        { granularity: "raw" },
      );

      expect(rows).toHaveLength(3);
      expect(rows[0]).not.toHaveProperty("s0");
      expect(rows[2]).toMatchObject({ s0: 1, s1: 3 });
    });

    it("gaps=true: intervalo maior que 1,5 bucket entre dois pontos ganha um null (o traço é interrompido)", () => {
      const rows = buildRows(
        [
          {
            label: "T",
            color: "#f97316",
            points: [
              { t: START, v: 20 },
              { t: START + HOUR, v: 21 },
              { t: START + 5 * HOUR, v: 22 },
            ],
          },
        ],
        { granularity: "hour", gaps: true },
      );

      expect(rows.map((row) => row.s0)).toEqual([20, 21, null, 22]);
    });

    it("séries sem pontos produzem zero linhas", () => {
      expect(buildRows([], { granularity: "raw" })).toEqual([]);
      expect(
        buildRows([{ label: "T", color: "#f97316", points: [] }], { granularity: "raw" }),
      ).toEqual([]);
    });
  });

  describe("axisLayout (eixo Y legível)", () => {
    it("pressão (~1010 hPa): eixo mais largo que o de temperatura, para o rótulo não ser cortado", () => {
      const pressure = axisLayout(
        { label: "P", color: "#0d9488", points: pts([1007.7, 1013.7]) },
        "hPa",
      );
      const temperature = axisLayout(
        { label: "T", color: "#f97316", points: pts([18.2, 24.6]) },
        "°C",
      );
      expect(pressure.width).toBeGreaterThan(temperature.width);
      expect(pressure.width).toBeGreaterThanOrEqual(9 * 6);
    });

    it("amplitude ≥ 10 dispensa casas decimais nos ticks", () => {
      expect(axisLayout({ label: "U", color: "#0ea5e9", points: pts([40, 100]) }, "%").digits).toBe(
        0,
      );
      expect(axisLayout({ label: "T", color: "#f97316", points: pts([20, 24]) }, "°C").digits).toBe(
        1,
      );
    });
  });

  describe("boundedDomain (limites físicos — revisão de 2026-11-24)", () => {
    it("umidade perto de 100% não ganha respiro acima de 100", () => {
      const [, max] = boundedDomain([40, 100], { min: 0, max: 100 });
      expect(max).toBe(100);
    });

    it("sem limites, é o mesmo respiro de paddedDomain", () => {
      expect(boundedDomain([10, 50], undefined)).toEqual(paddedDomain([10, 50]));
    });

    it("grandeza não negativa (UV, chuva) nunca desce abaixo de 0", () => {
      const [min] = boundedDomain([0, 5], { min: 0 });
      expect(min).toBe(0);
    });
  });

  describe("paddedDomain (respiro vertical — feedback do usuário, 2026-07-24: escala nunca cortada)", () => {
    it("abre ~12% da amplitude acima do máximo e abaixo do mínimo", () => {
      const [min, max] = paddedDomain([10, 50]);

      expect(min).toBeCloseTo(5.2);
      expect(max).toBeCloseTo(54.8);
    });

    it("série constante (min===max) ganha ±1 em vez de um eixo de altura zero", () => {
      expect(paddedDomain([20, 20])).toEqual([19, 21]);
    });
  });

  describe("barDomain (barras: base fixa em 0, respiro só no topo)", () => {
    it("começa em 0 e abre ~12% acima do máximo — a barra mais alta nunca encosta no topo", () => {
      const [min, max] = barDomain([0.5, 4]);

      expect(min).toBe(0);
      expect(max).toBeCloseTo(4.48);
    });

    it("todas as barras em zero ganham um topo de 1 em vez de um eixo de altura zero", () => {
      expect(barDomain([0, 0])).toEqual([0, 1]);
    });
  });
});

describe("ChartCard", () => {
  describe("variant='line'", () => {
    it("renderiza título e uma área por série dentro do gráfico acessível", () => {
      const { container } = render(
        <ChartCard
          title="Temperatura & Umidade — últimas 24h"
          variant="line"
          series={[
            { label: "Temperatura", color: "#f97316", points: pts([20, 22, 21, 24]) },
            { label: "Umidade", color: "#0ea5e9", points: pts([60, 58, 62, 61]) },
          ]}
        />,
      );

      expect(
        screen.getByRole("heading", { name: "Temperatura & Umidade — últimas 24h" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("chart-svg")).toBe(
        screen.getByRole("img", { name: "Gráfico de linha: Temperatura & Umidade — últimas 24h" }),
      );
      expect(container.querySelectorAll(".recharts-area")).toHaveLength(2);
    });

    it("renderiza a legenda com um item por série", () => {
      render(
        <ChartCard
          title="Temp & Umid"
          variant="line"
          series={[
            { label: "Temperatura", color: "#f97316", points: pts([1, 2]) },
            { label: "Umidade", color: "#0ea5e9", points: pts([3, 4]) },
          ]}
        />,
      );

      const items = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual(["Temperatura", "Umidade"]);
    });

    it("área preenchida (feedback do usuário, 2026-07-24): traço e gradiente de cada série usam a cor DA PRÓPRIA série, com opacidade baixa no preenchimento", () => {
      const { container } = render(
        <ChartCard
          title="Temp & Umid"
          variant="line"
          series={[
            { label: "Temperatura", color: "#f97316", points: pts([20, 22, 21, 24]) },
            { label: "Umidade", color: "#0ea5e9", points: pts([60, 58, 62, 61]) },
          ]}
        />,
      );

      // A cor chega às séries via variável CSS (--color-s0/--color-s1) que o
      // ChartContainer declara a partir do config — é o contrato do shadcn.
      const css = container.querySelector("style")!.textContent!;
      expect(css).toContain("--color-s0: #f97316");
      expect(css).toContain("--color-s1: #0ea5e9");

      const areas = container.querySelectorAll(".recharts-area");
      areas.forEach((area, index) => {
        const color = `var(--color-s${index})`;
        expect(area.querySelector(".recharts-area-curve")).toHaveAttribute("stroke", color);

        const gradientId = area
          .querySelector(".recharts-area-area")!
          .getAttribute("fill")!
          .match(/^url\(#(.+)\)$/)![1]!;
        const stops = container.querySelectorAll(`[id="${gradientId}"] stop`);
        expect(stops.length).toBeGreaterThan(0);
        stops.forEach((stop) => {
          expect(stop).toHaveAttribute("stop-color", color);
          expect(Number(stop.getAttribute("stop-opacity"))).toBeGreaterThan(0);
          expect(Number(stop.getAttribute("stop-opacity"))).toBeLessThan(1);
        });
      });
    });

    it("série com menos de 2 pontos não quebra as demais: todas as áreas são desenhadas e a curta ganha marcador", () => {
      const { container } = render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[
            { label: "Curta", color: "#f97316", points: pts([1]) },
            { label: "Longa", color: "#0ea5e9", points: pts([1, 2, 3]) },
          ]}
        />,
      );

      expect(container.querySelectorAll(".recharts-area")).toHaveLength(2);
      // Só a série de 1 ponto ganha marcador (`dot`); a longa fica só com a curva.
      expect(container.querySelectorAll(".recharts-dot")).toHaveLength(1);
    });

    it("série com exatamente 1 ponto desenha um marcador visível em vez de sumir (bug real: estação nova com só 1 dia de dado ficava com o card em branco)", async () => {
      const { container } = render(
        <ChartCard
          title="Temperatura"
          variant="line"
          unit="°C"
          series={[{ label: "Temperatura", color: "#f97316", points: pts([24.65]) }]}
        />,
      );

      // Não há linha com 1 ponto só, mas o dado não pode ficar invisível.
      expect(container.querySelectorAll(".recharts-dot")).toHaveLength(1);

      const tooltip = await hoverAt(container, 180);
      expect(tooltip).toHaveTextContent("23/07 14:00");
      expect(tooltip).toHaveTextContent("24,7°C");
    });

    it("série constante (min===max) não quebra a curva e o eixo ganha ±1 de respiro", () => {
      const { container } = render(
        <ChartCard
          title="Chart"
          variant="line"
          unit="°C"
          series={[{ label: "Temperatura", color: "#f97316", points: pts([20, 20, 20]) }]}
        />,
      );

      const d = container.querySelector(".recharts-area-curve")!.getAttribute("d")!;
      expect(d).not.toContain("NaN");
      expect(yAxisTicks(container)).toEqual([["19°C", "20°C", "21°C"]]);
    });

    it("eixo X é tempo: os rótulos são horários reais e o domínio é a janela recebida", () => {
      const { container } = render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: pts([1, 2, 3]) }]}
          domain={[START - 2 * HOUR, START + 22 * HOUR]}
        />,
      );

      const ticks = Array.from(
        container.querySelectorAll(".recharts-xAxis-tick-labels text"),
        (text) => text.textContent,
      );
      expect(ticks.length).toBeGreaterThan(1);
      ticks.forEach((tick) => expect(tick).toMatch(/^\d{2}:\d{2}$/));
    });

    it("divisores de dia só aparecem acima de 2 dias (um por meia-noite local)", () => {
      const { rerender } = render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: pts([1, 2, 3]) }]}
          domain={[START, START + 24 * HOUR]}
        />,
      );
      expect(screen.getByTestId("chart-svg")).toHaveAttribute("data-day-dividers", "0");

      rerender(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: pts([1, 2, 3]) }]}
          domain={[START, START + 7 * 24 * HOUR]}
        />,
      );
      expect(screen.getByTestId("chart-svg")).toHaveAttribute("data-day-dividers", "7");
    });

    it("umidade com limites [0, 100]: o eixo nunca passa de 100%", () => {
      const { container } = render(
        <ChartCard
          title="Umidade"
          variant="line"
          unit="%"
          series={[
            {
              label: "Umidade",
              color: "#0ea5e9",
              points: pts([40, 100, 100]),
              bounds: { min: 0, max: 100 },
            },
          ]}
        />,
      );

      const [ticks] = yAxisTicks(container);
      expect(Math.max(...ticks!.map(tickNumber))).toBeLessThanOrEqual(100);
    });
  });

  describe("variant='dots' (leituras brutas ao longo do tempo)", () => {
    it("desenha um ponto por valor, sem área, com legenda por série", () => {
      const { container } = render(
        <ChartCard
          title="Temperatura e Umidade — leituras"
          variant="dots"
          series={[
            { label: "Temperatura", color: "#f97316", points: pts([20, 22, 21]), unit: "°C" },
            { label: "Umidade", color: "#0ea5e9", points: pts([60, 58]), unit: "%" },
          ]}
        />,
      );

      expect(
        screen.getByRole("img", { name: "Gráfico de pontos: Temperatura e Umidade — leituras" }),
      ).toBeInTheDocument();
      expect(container.querySelectorAll(".recharts-area")).toHaveLength(0);
      expect(container.querySelectorAll(".recharts-scatter-symbol")).toHaveLength(5);
      const items = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual(["Temperatura", "Umidade"]);
      expect(yAxisTicks(container)).toHaveLength(2);
    });

    it("mostra a descrição sob o título", () => {
      render(
        <ChartCard
          title="Leituras"
          description="1 a cada 3 leituras da estação"
          variant="dots"
          series={[{ label: "Temperatura", color: "#f97316", points: pts([20, 22]) }]}
        />,
      );

      expect(screen.getByText("1 a cada 3 leituras da estação")).toBeInTheDocument();
    });
  });

  describe("variant='total' (uma barra com o total do período)", () => {
    it("desenha uma barra e o tooltip mostra a janela e o total", async () => {
      const { container } = render(
        <ChartCard
          title="Chuva (Acumulada)"
          variant="total"
          unit="mm"
          totalLabel="Últimas 24h"
          series={[{ label: "Chuva", color: "#06b6d4", points: [{ t: START, v: 12.5 }] }]}
        />,
      );

      expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(1);
      // O total vem escrito no cabeçalho (um período seco, 0 mm, não teria barra visível).
      expect(screen.getByTestId("chart-total")).toHaveTextContent("12,5mm");
      const tooltip = await hoverAt(container, 180);
      expect(tooltip).toHaveTextContent("Últimas 24h");
      expect(tooltip).toHaveTextContent("12,5mm");
    });
  });

  describe("variant='bar'", () => {
    it("renderiza título sem legenda (1 série só)", () => {
      render(
        <ChartCard
          title="Chuva acumulada — hoje"
          variant="bar"
          series={[{ label: "Chuva", color: "#06b6d4", points: pts([0, 2, 5, 1]) }]}
        />,
      );

      expect(screen.getByRole("heading", { name: "Chuva acumulada — hoje" })).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: "Gráfico de barras: Chuva acumulada — hoje" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("uma barra por ponto, todas na cor da série", () => {
      const { container } = render(
        <ChartCard
          title="Chuva"
          variant="bar"
          series={[{ label: "Chuva", color: "#06b6d4", points: pts([3, 2, 5, 1]) }]}
        />,
      );

      expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(4);
      expect(container.querySelector("style")!.textContent).toContain("--color-s0: #06b6d4");
    });

    it("todas as barras em zero não quebram (nada de NaN, eixo continua de pé)", () => {
      const { container } = render(
        <ChartCard
          title="Chuva"
          variant="bar"
          unit="mm"
          series={[{ label: "Chuva", color: "#06b6d4", points: pts([0, 0, 0]) }]}
        />,
      );

      expect(screen.getByTestId("chart-svg").innerHTML).not.toContain("NaN");
      expect(yAxisTicks(container)[0]![0]).toBe("0mm");
    });

    it("ignora séries extras além da primeira, sem lançar erro", async () => {
      const { container } = render(
        <ChartCard
          title="Chuva"
          variant="bar"
          unit="mm"
          series={[
            { label: "Chuva", color: "#06b6d4", points: pts([1, 2]) },
            { label: "Extra", color: "#000000", points: pts([9, 9, 9]) },
          ]}
        />,
      );

      expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2);
      expect(container.querySelector("style")!.textContent).not.toContain("--color-s1");

      const tooltip = await hoverAt(container, 250);
      expect(tooltip).toHaveTextContent("Chuva");
      expect(tooltip).not.toHaveTextContent("Extra");
    });
  });

  describe("estado vazio (DS-04)", () => {
    it("series=[] renderiza EmptyState em vez de gráfico quebrado", () => {
      render(<ChartCard title="Chuva acumulada" variant="bar" series={[]} />);

      expect(screen.getByText("Nenhum dado no período")).toBeInTheDocument();
      expect(screen.queryByTestId("chart-svg")).not.toBeInTheDocument();
    });

    it("série presente mas com points=[] também conta como vazio", () => {
      render(
        <ChartCard
          title="Temp"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: [] }]}
        />,
      );

      expect(screen.getByText("Nenhum dado no período")).toBeInTheDocument();
      expect(screen.queryByTestId("chart-svg")).not.toBeInTheDocument();
    });

    it("não renderiza legenda nem eixo Y quando vazio, mesmo em variant='line'", () => {
      const { container } = render(<ChartCard title="Temp" variant="line" series={[]} />);

      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      expect(container.querySelector(".recharts-yAxis")).not.toBeInTheDocument();
    });

    it("variant='bar' com series[0] vazio conta como vazio mesmo se uma série IGNORADA tiver pontos", () => {
      // series[1] nunca é desenhado em variant="bar" (só series[0]) — a
      // checagem de vazio precisa ser ciente disso, senão renderiza um
      // gráfico com zero barras em vez do EmptyState.
      render(
        <ChartCard
          title="Chuva acumulada"
          variant="bar"
          series={[
            { label: "Chuva", color: "#06b6d4", points: [] },
            { label: "Ignorada", color: "#000000", points: pts([1, 2, 3]) },
          ]}
        />,
      );

      expect(screen.getByText("Nenhum dado no período")).toBeInTheDocument();
      expect(screen.queryByTestId("chart-svg")).not.toBeInTheDocument();
    });
  });

  describe("respiro vertical (feedback do usuário, 2026-07-24: escala nunca cortada)", () => {
    it("variant='line': pico e vale não tocam as bordas da área de plotagem", () => {
      const { container } = render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: pts([10, 50, 10]) }]}
        />,
      );

      const { top, bottom } = plotArea(container);
      const ys = pathYs(container.querySelector(".recharts-area-curve")!.getAttribute("d")!);
      expect(ys.length).toBeGreaterThan(0);
      ys.forEach((y) => {
        expect(y).toBeGreaterThan(top);
        expect(y).toBeLessThan(bottom);
      });
    });
  });

  describe("tooltip no hover (feedback do usuário, 2026-07-24)", () => {
    it("variant='line': hover mostra o rótulo de tempo e o valor+unidade do ponto; sair do gráfico esconde", async () => {
      const { container } = render(
        <ChartCard
          title="Temperatura"
          variant="line"
          unit="°C"
          series={[{ label: "Temperatura", color: "#f97316", points: pts([20, 24.5]) }]}
        />,
      );

      const tooltip = await hoverAt(container, 300);
      expect(tooltip).toHaveTextContent("23/07 15:00");
      expect(tooltip).toHaveTextContent("Temperatura24,5°C");

      fireEvent.mouseLeave(container.querySelector(".recharts-wrapper")!);
      await waitFor(() => expect(tooltip).not.toBeVisible());
    });

    it("variant='bar': hover numa barra mostra o rótulo de tempo e o valor+unidade", async () => {
      const { container } = render(
        <ChartCard
          title="Chuva"
          variant="bar"
          unit="mm"
          series={[{ label: "Chuva", color: "#06b6d4", points: pts([0, 2.4]) }]}
        />,
      );

      const tooltip = await hoverAt(container, 300);
      expect(tooltip).toHaveTextContent("23/07 15:00");
      expect(tooltip).toHaveTextContent("2,4mm");
    });

    it("o tooltip mostra o valor formatado com unidade", async () => {
      const { container } = render(
        <ChartCard
          title="Chart"
          variant="line"
          unit="%"
          series={[{ label: "Umidade", color: "#0ea5e9", points: pts([60, 61]) }]}
        />,
      );

      const tooltip = await hoverAt(container, 50);
      expect(tooltip).toHaveTextContent("Umidade60%");
    });
  });

  describe("escala lateral / eixo Y (feedback do usuário, 2026-07-24)", () => {
    it("variant='line': os ticks trazem a unidade e a escala cobre do mínimo ao máximo da série", () => {
      const { container } = render(
        <ChartCard
          title="Temperatura"
          variant="line"
          unit="°C"
          series={[{ label: "Temperatura", color: "#f97316", points: pts([18, 24.6, 20]) }]}
        />,
      );

      const [ticks] = yAxisTicks(container);
      expect(ticks!.length).toBeGreaterThan(1);
      ticks!.forEach((tick) => expect(tick).toMatch(/°C$/));
      expect(Math.min(...ticks!.map(tickNumber))).toBeLessThanOrEqual(18);
      expect(Math.max(...ticks!.map(tickNumber))).toBeGreaterThanOrEqual(24.6);
    });

    it("variant='bar': a base do eixo é sempre 0, não o mínimo da série", () => {
      const { container } = render(
        <ChartCard
          title="Chuva"
          variant="bar"
          unit="mm"
          series={[{ label: "Chuva", color: "#06b6d4", points: pts([1, 5]) }]}
        />,
      );

      const [ticks] = yAxisTicks(container);
      expect(ticks![0]).toBe("0mm");
      expect(Math.max(...ticks!.map(tickNumber))).toBeGreaterThanOrEqual(5);
    });
  });

  describe("unidade por série (ChartSeries.unit — combos de 2 métricas)", () => {
    it("cada série usa sua PRÓPRIA unidade no tooltip quando as unidades divergem", async () => {
      const { container } = render(
        <ChartCard
          title="Temperatura × Umidade"
          variant="line"
          series={[
            { label: "Temperatura", color: "#f97316", points: pts([20, 24]), unit: "°C" },
            { label: "Umidade", color: "#0ea5e9", points: pts([60, 65]), unit: "%" },
          ]}
        />,
      );

      const tooltip = await hoverAt(container, 50);
      expect(tooltip).toHaveTextContent("Temperatura20°C");
      expect(tooltip).toHaveTextContent("Umidade60%");
    });

    it("série sem unit própria cai no unit do card (retrocompatibilidade)", async () => {
      const { container } = render(
        <ChartCard
          title="Temperatura"
          variant="line"
          unit="°C"
          series={[{ label: "Temperatura", color: "#f97316", points: pts([20, 24]) }]}
        />,
      );

      const tooltip = await hoverAt(container, 50);
      expect(tooltip).toHaveTextContent("20°C");
      yAxisTicks(container)[0]!.forEach((tick) => expect(tick).toMatch(/°C$/));
    });

    it("unidades diferentes ganham um eixo Y POR série (°C à esquerda, % à direita) — dividir um eixo só achataria uma das curvas", () => {
      const { container } = render(
        <ChartCard
          title="Temperatura × Umidade"
          variant="line"
          series={[
            { label: "Temperatura", color: "#f97316", points: pts([20, 24]), unit: "°C" },
            { label: "Umidade", color: "#0ea5e9", points: pts([60, 65]), unit: "%" },
          ]}
        />,
      );

      const axes = yAxisTicks(container);
      expect(axes).toHaveLength(2);
      axes[0]!.forEach((tick) => expect(tick).toMatch(/°C$/));
      axes[1]!.forEach((tick) => expect(tick).toMatch(/%$/));
    });

    it("séries com a mesma unidade compartilham um eixo Y só, cobrindo as duas", () => {
      const { container } = render(
        <ChartCard
          title="Temperatura × Sensação"
          variant="line"
          series={[
            { label: "Temperatura", color: "#f97316", points: pts([18, 24]), unit: "°C" },
            { label: "Sensação", color: "#eab308", points: pts([17, 25]), unit: "°C" },
          ]}
        />,
      );

      const axes = yAxisTicks(container);
      expect(axes).toHaveLength(1);
      expect(Math.min(...axes[0]!.map(tickNumber))).toBeLessThanOrEqual(17);
      expect(Math.max(...axes[0]!.map(tickNumber))).toBeGreaterThanOrEqual(25);
    });
  });

  it("expõe data-testid='chartcard' na raiz do card", () => {
    render(
      <ChartCard
        title="Chart"
        variant="line"
        series={[{ label: "Temperatura", color: "#f97316", points: pts([1, 2, 3]) }]}
      />,
    );

    expect(screen.getByTestId("chartcard")).toContainElement(screen.getByTestId("chart-svg"));
  });
});
