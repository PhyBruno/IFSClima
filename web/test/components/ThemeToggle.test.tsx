import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "../../src/components/ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("tem nome acessível 'Modo escuro' e papel de switch", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("switch", { name: /modo escuro/i })).toBeInTheDocument();
  });

  it("estado inicial: representa tema escuro (default D16) sem forçar data-theme no mount", () => {
    render(<ThemeToggle />);

    const toggle = screen.getByRole("switch", { name: /modo escuro/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveClass("bg-toggle-track-on");
    // Não deve, sozinho, aplicar data-theme no mount.
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("clique alterna para claro: muda a classe visual e seta data-theme='light' no elemento raiz", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: /modo escuro/i });

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveClass("bg-toggle-track-off");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("segundo clique volta para escuro: seta data-theme='dark' explicitamente", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: /modo escuro/i });

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveClass("bg-toggle-track-on");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("é um <button> nativo — operável via teclado (Enter/Espaço) sem lógica extra", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: /modo escuro/i });

    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).not.toHaveAttribute("tabindex", "-1");
  });

  it("modo controlado: reflete a prop `theme` e chama onChange sem alterar o DOM sozinho", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ThemeToggle theme="light" onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: /modo escuro/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith("dark");
    // Controlado: o componente não deve escrever em document.documentElement.
    expect(document.documentElement.dataset.theme).toBeUndefined();

    rerender(<ThemeToggle theme="dark" onChange={onChange} />);
    expect(screen.getByRole("switch", { name: /modo escuro/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
