import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Skeleton } from "../../src/components/Skeleton";

/**
 * `Skeleton` (F6 T6.4) — bloco de placeholder genérico para estados de
 * carregamento inicial (sem dado em cache ainda). Decorativo por natureza
 * (não carrega nenhuma informação própria) — `aria-hidden` (DS-06/a11y:
 * quem usa leitor de tela não deve ouvir "vazio, vazio, vazio" 5x, só o
 * estado final quando os dados chegarem).
 */
describe("Skeleton", () => {
  it("renderiza um bloco decorativo com animação de pulso", () => {
    render(<Skeleton data-testid="sk" />);

    const el = screen.getByTestId("sk");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveClass("animate-pulse");
  });

  it("aceita className extra para dimensionar por chamador (evitar layout shift)", () => {
    render(<Skeleton data-testid="sk" className="h-20 w-full" />);

    expect(screen.getByTestId("sk")).toHaveClass("h-20", "w-full", "animate-pulse");
  });
});
