import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatCard } from "../../src/components/StatCard";

const ICON = <svg data-testid="icon" />;

describe("StatCard", () => {
  it("renderiza label, valor e unidade", () => {
    render(
      <StatCard sensor="temperature" label="Temperatura" value={24.6} unit="°C" icon={ICON} />,
    );

    expect(screen.getByText("Temperatura")).toBeInTheDocument();
    expect(screen.getByText("24.6")).toBeInTheDocument();
    expect(screen.getByText("°C")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("aplica a cor de acento correta por sensor no ícone", () => {
    render(<StatCard sensor="pressure" label="Pressão" value={1013} unit="hPa" icon={ICON} />);

    const chip = screen.getByTestId("icon").parentElement;
    // §1.4: pressão é teal, não azul.
    expect(chip).toHaveClass("text-sensor-pressure");
    expect(chip).not.toHaveClass("text-sensor-humidity");
  });

  it("valor grande usa peso 700 + tabular-nums (evita jitter de largura)", () => {
    render(
      <StatCard sensor="temperature" label="Temperatura" value={24.6} unit="°C" icon={ICON} />,
    );

    const value = screen.getByText("24.6");
    expect(value).toHaveClass("font-bold", "tabular-nums");
  });

  it.each([
    ["up", "status-positive", "▲"],
    ["down", "status-negative", "▼"],
    ["flat", "status-neutral", "—"],
  ] as const)(
    "trend='%s' usa cor %s e seta '%s' — direcional, não por sensor",
    (trend, colorClass, arrow) => {
      render(
        <StatCard
          sensor="rain"
          label="Chuva"
          value={4}
          unit="mm"
          icon={ICON}
          trend={trend}
          deltaText="0.4mm"
        />,
      );

      const delta = screen.getByText(`${arrow} 0.4mm`);
      expect(delta).toHaveClass(`text-${colorClass}`);
    },
  );

  it("mesmo trend='up' produz a MESMA cor independente do sensor (delta não é por sensor)", () => {
    const { rerender } = render(
      <StatCard
        sensor="rain"
        label="Chuva"
        value={1}
        unit="mm"
        icon={ICON}
        trend="up"
        deltaText="+1"
      />,
    );
    expect(screen.getByText("▲ +1")).toHaveClass("text-status-positive");

    rerender(
      <StatCard
        sensor="temperature"
        label="Temperatura"
        value={1}
        unit="°C"
        icon={ICON}
        trend="up"
        deltaText="+1"
      />,
    );
    expect(screen.getByText("▲ +1")).toHaveClass("text-status-positive");
  });

  it("trend sem deltaText mostra só a seta, sem espaço/undefined sobrando", () => {
    render(<StatCard sensor="rain" label="Chuva" value={4} unit="mm" icon={ICON} trend="flat" />);

    const delta = screen.getByText("—");
    expect(delta).toHaveClass("text-status-neutral");
  });

  it("sem prop trend, não renderiza nenhuma seta/delta inventada", () => {
    render(
      <StatCard sensor="temperature" label="Temperatura" value={24.6} unit="°C" icon={ICON} />,
    );

    expect(screen.queryByText("▲")).not.toBeInTheDocument();
    expect(screen.queryByText("▼")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("a11y: a seta do delta não é decorativa sozinha — texto visível ao lado, não aria-hidden isolado", () => {
    render(
      <StatCard
        sensor="temperature"
        label="Temperatura"
        value={24.6}
        unit="°C"
        icon={ICON}
        trend="up"
        deltaText="+0.4°C"
      />,
    );

    const delta = screen.getByText("▲ +0.4°C");
    expect(delta).not.toHaveAttribute("aria-hidden");
  });

  it("desenha o sparkline com >= 2 pontos", () => {
    render(
      <StatCard
        sensor="humidity"
        label="Umidade"
        value={60}
        unit="%"
        icon={ICON}
        sparklinePoints={[10, 20, 15, 30]}
      />,
    );

    const svg = screen.getByTestId("sparkline");
    const polyline = svg.querySelector("polyline");
    expect(polyline).toBeInTheDocument();
    expect(polyline).toHaveClass("stroke-sensor-humidity");
  });

  it("com menos de 2 pontos, não tenta desenhar (sem crash, sem polyline degenerada)", () => {
    render(
      <StatCard
        sensor="humidity"
        label="Umidade"
        value={60}
        unit="%"
        icon={ICON}
        sparklinePoints={[10]}
      />,
    );

    expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
  });

  it("sem sparklinePoints, não renderiza svg nenhum", () => {
    render(<StatCard sensor="humidity" label="Umidade" value={60} unit="%" icon={ICON} />);

    expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
  });

  it("série constante (min===max) não quebra o cálculo do sparkline", () => {
    render(
      <StatCard
        sensor="humidity"
        label="Umidade"
        value={60}
        unit="%"
        icon={ICON}
        sparklinePoints={[5, 5, 5]}
      />,
    );

    expect(screen.getByTestId("sparkline").querySelector("polyline")).toBeInTheDocument();
  });

  describe("estado nulo/offline (DS-04)", () => {
    it("value===null mostra 'Sem sinal' em vez de valor/unidade", () => {
      render(<StatCard sensor="wind" label="Vento" value={null} unit="km/h" icon={ICON} />);

      expect(screen.getByText("Sem sinal")).toBeInTheDocument();
      expect(screen.getByText("Vento")).toBeInTheDocument();
      expect(screen.queryByText("km/h")).not.toBeInTheDocument();
    });

    it("mostra lastSeenText quando fornecido", () => {
      render(
        <StatCard
          sensor="wind"
          label="Vento"
          value={null}
          unit="km/h"
          icon={ICON}
          lastSeenText="Última leitura há 3h"
        />,
      );

      expect(screen.getByText("Última leitura há 3h")).toBeInTheDocument();
    });

    it("sem lastSeenText, não renderiza 'undefined'", () => {
      render(<StatCard sensor="wind" label="Vento" value={null} unit="km/h" icon={ICON} />);

      expect(screen.queryByText("undefined")).not.toBeInTheDocument();
    });

    it("não desenha sparkline mesmo se sparklinePoints for passado por engano", () => {
      render(
        <StatCard
          sensor="wind"
          label="Vento"
          value={null}
          unit="km/h"
          icon={ICON}
          sparklinePoints={[1, 2, 3]}
        />,
      );

      expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
    });

    it("ícone fica acinzentado (text-text-faint), não com a cor do sensor", () => {
      render(<StatCard sensor="wind" label="Vento" value={null} unit="km/h" icon={ICON} />);

      const chip = screen.getByTestId("icon").parentElement;
      expect(chip).toHaveClass("text-text-faint");
      expect(chip).not.toHaveClass("text-sensor-wind");
    });

    it("aplica borda tracejada (não a borda default sólida do Card)", () => {
      render(<StatCard sensor="wind" label="Vento" value={null} unit="km/h" icon={ICON} />);

      const card = screen.getByTestId("statcard");
      expect(card).toHaveClass("border-dashed", "!border-border-dashed");
    });

    it("não renderiza delta nenhum no estado offline mesmo se trend for passado", () => {
      render(
        <StatCard
          sensor="wind"
          label="Vento"
          value={null}
          unit="km/h"
          icon={ICON}
          trend="up"
          deltaText="+1"
        />,
      );

      expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
    });
  });

  describe("badge/tooltip (pedido do usuário, 2026-08-16)", () => {
    it("sem badge/tooltip, não renderiza nenhum dos dois (comportamento inalterado pros demais sensores)", () => {
      render(
        <StatCard sensor="temperature" label="Temperatura" value={24.6} unit="°C" icon={ICON} />,
      );

      expect(screen.queryByTestId("uv-badge")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /como/i })).not.toBeInTheDocument();
    });

    it("renderiza a badge passada ao lado do label", () => {
      render(
        <StatCard
          sensor="uv"
          label="Índice UV"
          value={5.3}
          unit=""
          icon={ICON}
          badge={<span data-testid="fake-badge">Moderado</span>}
        />,
      );

      expect(screen.getByTestId("fake-badge")).toBeInTheDocument();
    });

    it("renderiza o ícone de tooltip quando `tooltip` é passado, com aria-label derivado do label", () => {
      render(
        <StatCard
          sensor="humidity"
          label="Umidade"
          value={61.2}
          unit="%"
          icon={ICON}
          tooltip="Explicação."
        />,
      );

      const button = screen.getByRole("button", { name: /como umidade é calculado/i });
      expect(button).toBeInTheDocument();

      fireEvent.mouseEnter(button);
      expect(screen.getByRole("tooltip")).toHaveTextContent("Explicação.");
    });

    it("estado offline (value=null) ainda mostra o tooltip, mas nunca a badge", () => {
      render(
        <StatCard
          sensor="uv"
          label="Índice UV"
          value={null}
          unit=""
          icon={ICON}
          tooltip="Explicação do UV."
          badge={<span data-testid="fake-badge">Moderado</span>}
        />,
      );

      expect(
        screen.getByRole("button", { name: /como índice uv é calculado/i }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("fake-badge")).not.toBeInTheDocument();
    });
  });
});
