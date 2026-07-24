import { afterEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DemoGallery } from "../src/components/DemoGallery";

describe("DemoGallery", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("renderiza o título da galeria e o ThemeToggle para alternar tema ao vivo", () => {
    render(<DemoGallery />);

    expect(screen.getByRole("heading", { level: 1, name: /galeria de componentes/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /modo escuro/i })).toBeInTheDocument();
  });

  it("renderiza um StatCard por sensor (6) mais um exemplo offline (sem sinal)", () => {
    render(<DemoGallery />);

    const statcards = screen.getAllByTestId("statcard");
    expect(statcards).toHaveLength(7);
    expect(screen.getByText(/sem sinal/i)).toBeInTheDocument();
  });

  it("renderiza os três estados do ChartCard: line, bar e vazio", () => {
    render(<DemoGallery />);

    const chartcards = screen.getAllByTestId("chartcard");
    expect(chartcards).toHaveLength(3);
    expect(within(chartcards[0]!).getByTestId("chart-svg")).toBeInTheDocument();
    expect(within(chartcards[1]!).getByTestId("chart-svg")).toBeInTheDocument();
    expect(within(chartcards[2]!).getByText(/nenhum dado no período/i)).toBeInTheDocument();
  });

  it("renderiza o PeriodSelector nos dois modos (grupo de botões e dropdown)", () => {
    render(<DemoGallery />);

    const group = screen.getByRole("group", { name: /período/i });
    expect(within(group).getByRole("button", { name: /últimas 24h/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Dropdown é um <button> fora do role="group" — mesmo texto visível, papel diferente.
    expect(screen.getAllByRole("button", { name: /últimas 24h/i })).toHaveLength(2);
  });

  it("renderiza o StatusPill nas variantes card/inline, online e offline", () => {
    render(<DemoGallery />);

    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.getByText("Estação online")).toBeInTheDocument();
    expect(screen.getByText("Estação offline")).toBeInTheDocument();
  });

  it("usa títulos de seção em português (não os nomes técnicos em inglês)", () => {
    render(<DemoGallery />);

    for (const title of [
      "Cartão base",
      "Cartão de sensor",
      "Cartão de gráfico",
      "Seletor de período",
      "Indicador de status",
      "Estado vazio",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
    // Nenhum título de seção (h2) deve ser um nome técnico em inglês puro.
    for (const englishName of ["StatCard", "ChartCard", "PeriodSelector", "StatusPill", "EmptyState"]) {
      expect(screen.queryByRole("heading", { level: 2, name: englishName })).not.toBeInTheDocument();
    }
  });

  it("renderiza um EmptyState avulso como exemplo de uso genérico", () => {
    render(<DemoGallery />);

    // Duas ocorrências esperadas: o EmptyState avulso da seção dedicada e o
    // que o ChartCard "sem dados" (seção anterior) renderiza internamente.
    expect(screen.getAllByRole("heading", { name: /nenhum dado no período/i })).toHaveLength(2);
  });
});
