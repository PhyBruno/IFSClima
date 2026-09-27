import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import {
  ChartCard,
  barDomain,
  buildRows,
  formatValue,
  paddedDomain,
} from "../../src/components/ChartCard";

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

/** "24.6°C" → 24.6 (tira a unidade do tick). */
function tickNumber(tick: string): number {
  return Number.parseFloat(tick);
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
    it("arredonda para 1 casa decimal", () => {
      expect(formatValue(24.65)).toBe("24.7");
      expect(formatValue(1013.24)).toBe("1013.2");
    });

    it("omite o '.0' quando o valor arredondado é inteiro", () => {
      expect(formatValue(20)).toBe("20");
      expect(formatValue(19.96)).toBe("20");
    });
  });

  describe("buildRows", () => {
    it("alinha as séries por índice, uma chave (s0, s1…) por série, com o rótulo de cada ponto", () => {
      const rows = buildRows(
        [
          { label: "Temperatura", color: "#f97316", points: [20, 24] },
          { label: "Umidade", color: "#0ea5e9", points: [60, 65] },
        ],
        ["14:00", "15:00"],
      );

      expect(rows).toEqual([
        { label: "14:00", s0: 20, s1: 60 },
        { label: "15:00", s0: 24, s1: 65 },
      ]);
    });

    it("sem pointLabels, o rótulo cai na posição 1-based do ponto", () => {
      const rows = buildRows([{ label: "Umidade", color: "#0ea5e9", points: [60, 61] }], undefined);

      expect(rows.map((row) => row.label)).toEqual(["1", "2"]);
    });

    it("série mais curta fica sem valor (undefined) nos índices que não tem — não desloca as demais", () => {
      const rows = buildRows(
        [
          { label: "Curta", color: "#f97316", points: [1] },
          { label: "Longa", color: "#0ea5e9", points: [1, 2, 3] },
        ],
        undefined,
      );

      expect(rows).toHaveLength(3);
      expect(rows[2]).toEqual({ label: "3", s0: undefined, s1: 3 });
    });

    it("séries sem pontos produzem zero linhas", () => {
      expect(buildRows([], undefined)).toEqual([]);
      expect(buildRows([{ label: "T", color: "#f97316", points: [] }], undefined)).toEqual([]);
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
            { label: "Temperatura", color: "#f97316", points: [20, 22, 21, 24] },
            { label: "Umidade", color: "#0ea5e9", points: [60, 58, 62, 61] },
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
            { label: "Temperatura", color: "#f97316", points: [1, 2] },
            { label: "Umidade", color: "#0ea5e9", points: [3, 4] },
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
            { label: "Temperatura", color: "#f97316", points: [20, 22, 21, 24] },
            { label: "Umidade", color: "#0ea5e9", points: [60, 58, 62, 61] },
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
            { label: "Curta", color: "#f97316", points: [1] },
            { label: "Longa", color: "#0ea5e9", points: [1, 2, 3] },
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
          series={[{ label: "Temperatura", color: "#f97316", points: [24.65] }]}
          pointLabels={["04/08"]}
        />,
      );

      // Não há linha com 1 ponto só, mas o dado não pode ficar invisível.
      expect(container.querySelectorAll(".recharts-dot")).toHaveLength(1);

      const tooltip = await hoverAt(container, 180);
      expect(tooltip).toHaveTextContent("04/08");
      expect(tooltip).toHaveTextContent("24.7°C");
    });

    it("série constante (min===max) não quebra a curva e o eixo ganha ±1 de respiro", () => {
      const { container } = render(
        <ChartCard
          title="Chart"
          variant="line"
          unit="°C"
          series={[{ label: "Temperatura", color: "#f97316", points: [20, 20, 20] }]}
        />,
      );

      const d = container.querySelector(".recharts-area-curve")!.getAttribute("d")!;
      expect(d).not.toContain("NaN");
      expect(yAxisTicks(container)).toEqual([["19°C", "20°C", "21°C"]]);
    });

    it("renderiza xLabels abaixo do gráfico quando fornecido", () => {
      render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: [1, 2, 3] }]}
          xLabels={["07:00", "14:00", "21:00"]}
        />,
      );

      const labels = screen.getByTestId("chart-x-labels");
      expect(labels).toHaveTextContent("07:00");
      expect(labels).toHaveTextContent("21:00");
    });

    it("sem xLabels, não renderiza a faixa de rótulos do eixo X", () => {
      render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: [1, 2, 3] }]}
        />,
      );

      expect(screen.queryByTestId("chart-x-labels")).not.toBeInTheDocument();
    });
  });

  describe("variant='bar'", () => {
    it("renderiza título sem legenda (1 série só)", () => {
      render(
        <ChartCard
          title="Chuva acumulada — hoje"
          variant="bar"
          series={[{ label: "Chuva", color: "#06b6d4", points: [0, 2, 5, 1] }]}
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
          series={[{ label: "Chuva", color: "#06b6d4", points: [3, 2, 5, 1] }]}
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
          series={[{ label: "Chuva", color: "#06b6d4", points: [0, 0, 0] }]}
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
            { label: "Chuva", color: "#06b6d4", points: [1, 2] },
            { label: "Extra", color: "#000000", points: [9, 9, 9] },
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
            { label: "Ignorada", color: "#000000", points: [1, 2, 3] },
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
          series={[{ label: "Temperatura", color: "#f97316", points: [10, 50, 10] }]}
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
          series={[{ label: "Temperatura", color: "#f97316", points: [20, 24.5] }]}
          pointLabels={["14:00", "15:00"]}
        />,
      );

      const tooltip = await hoverAt(container, 300);
      expect(tooltip).toHaveTextContent("15:00");
      expect(tooltip).toHaveTextContent("Temperatura24.5°C");

      fireEvent.mouseLeave(container.querySelector(".recharts-wrapper")!);
      await waitFor(() => expect(tooltip).not.toBeVisible());
    });

    it("variant='bar': hover numa barra mostra o rótulo de tempo e o valor+unidade", async () => {
      const { container } = render(
        <ChartCard
          title="Chuva"
          variant="bar"
          unit="mm"
          series={[{ label: "Chuva", color: "#06b6d4", points: [0, 2.4] }]}
          pointLabels={["14:00", "15:00"]}
        />,
      );

      const tooltip = await hoverAt(container, 250);
      expect(tooltip).toHaveTextContent("15:00");
      expect(tooltip).toHaveTextContent("2.4mm");
    });

    it("sem pointLabels, o tooltip ainda mostra o valor formatado com unidade", async () => {
      const { container } = render(
        <ChartCard
          title="Chart"
          variant="line"
          unit="%"
          series={[{ label: "Umidade", color: "#0ea5e9", points: [60, 61] }]}
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
          series={[{ label: "Temperatura", color: "#f97316", points: [18, 24.6, 20] }]}
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
          series={[{ label: "Chuva", color: "#06b6d4", points: [1, 5] }]}
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
            { label: "Temperatura", color: "#f97316", points: [20, 24], unit: "°C" },
            { label: "Umidade", color: "#0ea5e9", points: [60, 65], unit: "%" },
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
          series={[{ label: "Temperatura", color: "#f97316", points: [20, 24] }]}
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
            { label: "Temperatura", color: "#f97316", points: [20, 24], unit: "°C" },
            { label: "Umidade", color: "#0ea5e9", points: [60, 65], unit: "%" },
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
            { label: "Temperatura", color: "#f97316", points: [18, 24], unit: "°C" },
            { label: "Sensação", color: "#eab308", points: [17, 25], unit: "°C" },
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
        series={[{ label: "Temperatura", color: "#f97316", points: [1, 2, 3] }]}
      />,
    );

    expect(screen.getByTestId("chartcard")).toContainElement(screen.getByTestId("chart-svg"));
  });
});
