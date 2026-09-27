import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PeriodSelector } from "../../src/components/PeriodSelector";

const OPTIONS = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "custom", label: "Personalizado ▾" },
];

describe("PeriodSelector", () => {
  describe("modo grupo (buttons/pill — mesma árvore, radius responsivo)", () => {
    it("renderiza um botão por opção", () => {
      render(<PeriodSelector options={OPTIONS} value="today" onChange={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Hoje" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "7 dias" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "30 dias" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Personalizado ▾" })).toBeInTheDocument();
    });

    it("marca a opção ativa com aria-pressed=true e variante de destaque (default); as demais false (outline)", () => {
      render(<PeriodSelector options={OPTIONS} value="7d" onChange={vi.fn()} />);

      const active = screen.getByRole("button", { name: "7 dias" });
      const inactive = screen.getByRole("button", { name: "Hoje" });

      expect(active).toHaveAttribute("aria-pressed", "true");
      expect(active).toHaveAttribute("data-variant", "default");

      expect(inactive).toHaveAttribute("aria-pressed", "false");
      expect(inactive).toHaveAttribute("data-variant", "outline");
    });

    it("clicar numa opção chama onChange com o value certo", () => {
      const onChange = vi.fn();
      render(<PeriodSelector options={OPTIONS} value="today" onChange={onChange} />);

      fireEvent.click(screen.getByRole("button", { name: "30 dias" }));

      expect(onChange).toHaveBeenCalledWith("30d");
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("mudar o value externo (controlado) muda qual botão está ativo", () => {
      const { rerender } = render(
        <PeriodSelector options={OPTIONS} value="today" onChange={vi.fn()} />,
      );
      expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");

      rerender(<PeriodSelector options={OPTIONS} value="30d" onChange={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("button", { name: "30 dias" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("radius é responsivo (pill no mobile, retangular no desktop) na mesma árvore de botões", () => {
      render(<PeriodSelector options={OPTIONS} value="today" onChange={vi.fn()} />);

      const button = screen.getByRole("button", { name: "Hoje" });
      expect(button).toHaveClass("rounded-full", "md:rounded-lg");
    });

    it("a11y: o grupo tem role='group' com nome acessível", () => {
      render(<PeriodSelector options={OPTIONS} value="today" onChange={vi.fn()} />);

      expect(screen.getByRole("group", { name: "Período" })).toBeInTheDocument();
    });

    it("overflow-x-auto no container permite scroll horizontal em vez de quebrar linha (mobile)", () => {
      render(<PeriodSelector options={OPTIONS} value="today" onChange={vi.fn()} />);

      expect(screen.getByRole("group")).toHaveClass("overflow-x-auto");
    });

    it("opção 'custom' é só mais uma opção clicável, sem abrir nada", () => {
      const onChange = vi.fn();
      render(<PeriodSelector options={OPTIONS} value="today" onChange={onChange} />);

      fireEvent.click(screen.getByRole("button", { name: "Personalizado ▾" }));

      expect(onChange).toHaveBeenCalledWith("custom");
    });
  });

  describe("modo 'dropdown' (Dashboard)", () => {
    it("renderiza um único botão com o label formatado", () => {
      render(<PeriodSelector mode="dropdown" label="Últimas 24h" />);

      expect(screen.getByRole("button", { name: /últimas 24h/i })).toBeInTheDocument();
      // Não deve renderizar um grupo de opções junto.
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
    });

    it("clique chama onClick (não abre menu nenhum sozinho)", () => {
      const onClick = vi.fn();
      render(<PeriodSelector mode="dropdown" label="Últimas 24h" onClick={onClick} />);

      fireEvent.click(screen.getByRole("button", { name: /últimas 24h/i }));

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("sem onClick, não quebra ao clicar", () => {
      render(<PeriodSelector mode="dropdown" label="Últimas 24h" />);

      expect(() =>
        fireEvent.click(screen.getByRole("button", { name: /últimas 24h/i })),
      ).not.toThrow();
    });

    it("renderiza um único botão, não um grupo (estruturalmente diferente do modo grupo)", () => {
      render(<PeriodSelector mode="dropdown" label="Últimas 24h" />);

      expect(screen.getAllByRole("button")).toHaveLength(1);
    });
  });
});
