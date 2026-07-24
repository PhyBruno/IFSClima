import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChartCard } from "../../src/components/ChartCard";

describe("ChartCard", () => {
  describe("variant='line'", () => {
    it("renderiza título e uma polyline por série", () => {
      render(
        <ChartCard
          title="Temperatura & Umidade — últimas 24h"
          variant="line"
          series={[
            { label: "Temperatura", color: "#f97316", points: [20, 22, 21, 24] },
            { label: "Umidade", color: "#0ea5e9", points: [60, 58, 62, 61] },
          ]}
        />,
      );

      expect(screen.getByText("Temperatura & Umidade — últimas 24h")).toBeInTheDocument();
      const svg = screen.getByTestId("chart-svg");
      expect(svg.querySelectorAll("polyline")).toHaveLength(2);
    });

    it("renderiza a legenda com um dot colorido por série", () => {
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

      expect(screen.getByText("Temperatura")).toBeInTheDocument();
      expect(screen.getByText("Umidade")).toBeInTheDocument();
    });

    it("cada polyline usa a cor (stroke) da própria série", () => {
      render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: [1, 5, 3] }]}
        />,
      );

      const polyline = screen.getByTestId("chart-svg").querySelector("polyline");
      expect(polyline).toHaveAttribute("stroke", "#f97316");
    });

    it("área preenchida (feedback do usuário, 2026-07-24): um <polygon> por série, com fillOpacity baixa na cor da própria série", () => {
      render(
        <ChartCard
          title="Temp & Umid"
          variant="line"
          series={[
            { label: "Temperatura", color: "#f97316", points: [20, 22, 21, 24] },
            { label: "Umidade", color: "#0ea5e9", points: [60, 58, 62, 61] },
          ]}
        />,
      );

      const polygons = screen.getByTestId("chart-svg").querySelectorAll("polygon");
      expect(polygons).toHaveLength(2);
      expect(polygons[0]).toHaveAttribute("fill", "#f97316");
      expect(polygons[1]).toHaveAttribute("fill", "#0ea5e9");
      polygons.forEach((polygon) => {
        expect(Number(polygon.getAttribute("fill-opacity"))).toBeGreaterThan(0);
        expect(Number(polygon.getAttribute("fill-opacity"))).toBeLessThan(1);
      });
    });

    it("série com menos de 2 pontos não desenha polyline degenerada para aquela série, mas não quebra as demais", () => {
      render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[
            { label: "Curta", color: "#f97316", points: [1] },
            { label: "Longa", color: "#0ea5e9", points: [1, 2, 3] },
          ]}
        />,
      );

      const svg = screen.getByTestId("chart-svg");
      expect(svg.querySelectorAll("polyline")).toHaveLength(1);
    });

    it("série constante (min===max) não quebra o cálculo da polyline", () => {
      render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: [20, 20, 20] }]}
        />,
      );

      expect(screen.getByTestId("chart-svg").querySelector("polyline")).toBeInTheDocument();
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

      expect(screen.getByText("07:00")).toBeInTheDocument();
      expect(screen.getByText("21:00")).toBeInTheDocument();
    });

    it("sem xLabels, não renderiza nada de eixo X", () => {
      render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: [1, 2, 3] }]}
        />,
      );

      expect(screen.queryByText(/:00/)).not.toBeInTheDocument();
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

      expect(screen.getByText("Chuva acumulada — hoje")).toBeInTheDocument();
      expect(screen.queryByText("Chuva")).not.toBeInTheDocument();
    });

    it("renderiza um rect com rx=3 por barra, cor única", () => {
      render(
        <ChartCard
          title="Chuva"
          variant="bar"
          series={[{ label: "Chuva", color: "#06b6d4", points: [0, 2, 5, 1] }]}
        />,
      );

      const rects = screen.getByTestId("chart-svg").querySelectorAll("rect");
      expect(rects).toHaveLength(4);
      rects.forEach((rect) => {
        expect(rect).toHaveAttribute("rx", "3");
        expect(rect).toHaveAttribute("fill", "#06b6d4");
      });
    });

    it("todas as barras em zero não quebra (altura 0 em vez de NaN)", () => {
      render(
        <ChartCard title="Chuva" variant="bar" series={[{ label: "Chuva", color: "#06b6d4", points: [0, 0, 0] }]} />,
      );

      const rects = screen.getByTestId("chart-svg").querySelectorAll("rect");
      expect(rects).toHaveLength(3);
      rects.forEach((rect) => expect(rect).toHaveAttribute("height", "0"));
    });

    it("ignora séries extras além da primeira, sem lançar erro", () => {
      render(
        <ChartCard
          title="Chuva"
          variant="bar"
          series={[
            { label: "Chuva", color: "#06b6d4", points: [1, 2] },
            { label: "Extra", color: "#000000", points: [9, 9, 9] },
          ]}
        />,
      );

      const rects = screen.getByTestId("chart-svg").querySelectorAll("rect");
      expect(rects).toHaveLength(2);
    });
  });

  describe("estado vazio (DS-04)", () => {
    it("series=[] renderiza EmptyState em vez de svg quebrado", () => {
      render(<ChartCard title="Chuva acumulada" variant="bar" series={[]} />);

      expect(screen.getByText("Nenhum dado no período")).toBeInTheDocument();
      expect(screen.queryByTestId("chart-svg")).not.toBeInTheDocument();
    });

    it("série presente mas com points=[] também conta como vazio", () => {
      render(
        <ChartCard title="Temp" variant="line" series={[{ label: "Temperatura", color: "#f97316", points: [] }]} />,
      );

      expect(screen.getByText("Nenhum dado no período")).toBeInTheDocument();
      expect(screen.queryByTestId("chart-svg")).not.toBeInTheDocument();
    });

    it("não renderiza legenda quando vazio, mesmo em variant='line'", () => {
      render(<ChartCard title="Temp" variant="line" series={[]} />);

      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("variant='bar' com series[0] vazio conta como vazio mesmo se uma série IGNORADA tiver pontos", () => {
      // series[1] nunca é desenhado em variant="bar" (só series[0]) — a
      // checagem de vazio precisa ser ciente disso, senão renderiza um
      // <svg> com zero barras em vez do EmptyState.
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

  describe("headroom vertical (feedback do usuário, 2026-07-24: escala nunca cortada)", () => {
    it("variant='line': pico e vale não tocam as bordas do SVG (y=0/y=40)", () => {
      render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: [10, 50, 10] }]}
        />,
      );

      const points = screen
        .getByTestId("chart-svg")
        .querySelector("polyline")!
        .getAttribute("points")!
        .split(" ")
        .map((pair) => Number(pair.split(",")[1]));

      points.forEach((y) => {
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(40);
      });
    });

    it("variant='bar': a barra mais alta não toca o topo do SVG (y=0)", () => {
      render(
        <ChartCard title="Chuva" variant="bar" series={[{ label: "Chuva", color: "#06b6d4", points: [1, 5, 2] }]} />,
      );

      const rects = screen.getByTestId("chart-svg").querySelectorAll("rect");
      const tallestY = Math.min(...Array.from(rects).map((r) => Number(r.getAttribute("y"))));
      expect(tallestY).toBeGreaterThan(0);
    });
  });

  describe("pontos e tooltip no hover/foco (feedback do usuário, 2026-07-24)", () => {
    it("variant='line': desenha um <circle> visível por ponto de dado", () => {
      render(
        <ChartCard
          title="Chart"
          variant="line"
          series={[{ label: "Temperatura", color: "#f97316", points: [20, 22, 21, 24] }]}
        />,
      );

      const svg = screen.getByTestId("chart-svg");
      // 4 pontos: 4 círculos visíveis + 4 alvos de hover/foco (maiores, invisíveis).
      expect(svg.querySelectorAll("circle")).toHaveLength(8);
    });

    it("variant='line': hover num ponto mostra tooltip com o rótulo de tempo e o valor+unidade", () => {
      render(
        <ChartCard
          title="Temperatura"
          variant="line"
          unit="°C"
          series={[{ label: "Temperatura", color: "#f97316", points: [20, 24.5] }]}
          pointLabels={["14:00", "15:00"]}
        />,
      );

      expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();

      const hitTargets = screen.getAllByTestId("chart-point-hit");
      fireEvent.mouseEnter(hitTargets[1]!);

      expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("15:00 — 24.5°C");

      fireEvent.mouseLeave(hitTargets[1]!);
      expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();
    });

    it("variant='line': foco via teclado (não só mouse) também mostra o tooltip", () => {
      render(
        <ChartCard
          title="Temperatura"
          variant="line"
          unit="°C"
          series={[{ label: "Temperatura", color: "#f97316", points: [20, 24.5] }]}
          pointLabels={["14:00", "15:00"]}
        />,
      );

      const hitTargets = screen.getAllByTestId("chart-point-hit");
      fireEvent.focus(hitTargets[0]!);
      expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("14:00 — 20°C");

      fireEvent.blur(hitTargets[0]!);
      expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();
    });

    it("variant='bar': hover numa barra mostra tooltip com o valor+unidade", () => {
      render(
        <ChartCard
          title="Chuva"
          variant="bar"
          unit="mm"
          series={[{ label: "Chuva", color: "#06b6d4", points: [0, 2.4] }]}
          pointLabels={["14:00", "15:00"]}
        />,
      );

      const bars = screen.getAllByTestId("chart-bar-hit");
      fireEvent.mouseEnter(bars[1]!);
      expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("15:00 — 2.4mm");
    });

    it("sem pointLabels, o tooltip mostra só o valor formatado", () => {
      render(
        <ChartCard
          title="Chart"
          variant="line"
          unit="%"
          series={[{ label: "Umidade", color: "#0ea5e9", points: [60, 61] }]}
        />,
      );

      fireEvent.mouseEnter(screen.getAllByTestId("chart-point-hit")[0]!);
      expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("60%");
    });
  });

  describe("escala lateral / eixo Y (feedback do usuário, 2026-07-24)", () => {
    it("variant='line': mostra o valor máximo (topo) e mínimo (base) da série, com unidade", () => {
      render(
        <ChartCard
          title="Temperatura"
          variant="line"
          unit="°C"
          series={[{ label: "Temperatura", color: "#f97316", points: [18, 24.6, 20] }]}
        />,
      );

      const axis = screen.getByTestId("chart-axis");
      expect(axis).toHaveTextContent("24.6°C");
      expect(axis).toHaveTextContent("18°C");
    });

    it("variant='bar': a base do eixo é sempre 0, não o mínimo da série", () => {
      render(
        <ChartCard title="Chuva" variant="bar" unit="mm" series={[{ label: "Chuva", color: "#06b6d4", points: [1, 5] }]} />,
      );

      const axis = screen.getByTestId("chart-axis");
      expect(axis).toHaveTextContent("5mm");
      expect(axis).toHaveTextContent("0mm");
    });

    it("estado vazio não renderiza o eixo lateral", () => {
      render(<ChartCard title="Chuva" variant="bar" series={[]} />);

      expect(screen.queryByTestId("chart-axis")).not.toBeInTheDocument();
    });
  });

  it("Card por baixo não recebe shadow (ChartCard é sempre flat, §3.3/§8.8)", () => {
    render(
      <ChartCard
        title="Chart"
        variant="line"
        series={[{ label: "Temperatura", color: "#f97316", points: [1, 2, 3] }]}
      />,
    );

    expect(screen.getByTestId("chartcard")).not.toHaveClass("shadow-card");
  });
});
