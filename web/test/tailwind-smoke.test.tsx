import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

// Classes Tailwind só viram CSS de verdade num build real via PostCSS — no
// jsdom do Vitest não há pipeline de build, então não afirmamos cor
// computada aqui. Este é apenas um smoke test de que o JSX compila e as
// classes semânticas do tema (bg-surface-card, text-text-primary) são
// aplicadas ao elemento renderizado. A geração de CSS real (sem erro de
// classe/token inválido) foi verificada manualmente com
// `npx tailwindcss -i src/index.css -o /tmp/out.css` (ver relatório da tarefa).
describe("smoke: classes do tema Tailwind", () => {
  it("aplica classes de superfície/texto do tema a um elemento", () => {
    render(<div data-testid="theme-smoke" className="bg-surface-card text-text-primary" />);

    const element = screen.getByTestId("theme-smoke");
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass("bg-surface-card", "text-text-primary");
  });

  it("aplica uma classe de acento de sensor", () => {
    render(<div data-testid="sensor-smoke" className="text-sensor-temperature" />);

    expect(screen.getByTestId("sensor-smoke")).toHaveClass("text-sensor-temperature");
  });

  // T5.2b: novas categorias/chaves adicionadas pro tema claro (mesma classe,
  // valor resolve diferente conforme data-theme — não testamos a troca em si
  // aqui, só que a classe continua existindo/aplicável, igual ao smoke acima.
  it("aplica classes novas de T5.2b (nav ativo, painel de status, sombra de card)", () => {
    render(
      <div
        data-testid="theme-light-smoke"
        className="bg-nav-active-bg text-nav-active-text bg-surface-status-panel shadow-card border-border-frame"
      />,
    );

    const element = screen.getByTestId("theme-light-smoke");
    expect(element).toHaveClass(
      "bg-nav-active-bg",
      "text-nav-active-text",
      "bg-surface-status-panel",
      "shadow-card",
      "border-border-frame",
    );
  });
});
