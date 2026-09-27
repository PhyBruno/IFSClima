import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "../../src/components/ThemeToggle";

const root = document.documentElement;

describe("ThemeToggle", () => {
  // Espelha o `index.html`: o `<html>` já nasce com `class="dark"`.
  beforeEach(() => {
    root.classList.add("dark");
  });

  afterEach(() => {
    root.classList.remove("dark");
  });

  it("tem nome acessível 'Modo escuro' e papel de switch", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("switch", { name: /modo escuro/i })).toBeInTheDocument();
  });

  it("estado inicial: representa tema escuro (default D16) sem tocar na classe do <html> no mount", () => {
    // Sem a classe de antemão: se o mount escrevesse no DOM, ela apareceria.
    root.classList.remove("dark");

    render(<ThemeToggle />);

    const toggle = screen.getByRole("switch", { name: /modo escuro/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveAttribute("data-state", "checked");
    expect(root).not.toHaveClass("dark");
  });

  it("clique alterna para claro: muda o estado visual e remove a classe 'dark' do elemento raiz", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: /modo escuro/i });

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAttribute("data-state", "unchecked");
    expect(root).not.toHaveClass("dark");
  });

  it("segundo clique volta para escuro: recoloca a classe 'dark' no elemento raiz", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: /modo escuro/i });

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveAttribute("data-state", "checked");
    expect(root).toHaveClass("dark");
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
    expect(root.className).toBe("dark");

    rerender(<ThemeToggle theme="dark" onChange={onChange} />);
    expect(screen.getByRole("switch", { name: /modo escuro/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
