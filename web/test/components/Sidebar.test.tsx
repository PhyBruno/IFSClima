import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "../../src/components/Sidebar";

describe("Sidebar", () => {
  it("marca o item Dashboard como página atual quando active='dashboard'", () => {
    render(<Sidebar active="dashboard" />);

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
    expect(dashboardLink).toHaveAttribute("href", "/");
  });

  it("'Histórico' aparece desabilitado (F8 ainda não existe como página) — não é um link", () => {
    render(<Sidebar active="dashboard" />);

    expect(screen.queryByRole("link", { name: /histórico/i })).not.toBeInTheDocument();
    const historico = screen.getByText("Histórico").closest('[aria-disabled="true"]');
    expect(historico).toBeInTheDocument();
  });

  it("inclui o ThemeToggle (F5) reaproveitado, não recriado", () => {
    render(<Sidebar active="dashboard" />);

    expect(screen.getByRole("switch", { name: /modo escuro/i })).toBeInTheDocument();
  });

  it("com active='historico' (uso futuro por F8), Dashboard deixa de ser a página atual", () => {
    render(<Sidebar active="historico" />);

    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
  });

  it("visível só a partir do breakpoint md (hidden no mobile)", () => {
    render(<Sidebar active="dashboard" />);

    expect(screen.getByRole("navigation", { name: /navegação principal/i }).closest("aside")).toHaveClass(
      "hidden",
      "md:flex",
    );
  });
});
