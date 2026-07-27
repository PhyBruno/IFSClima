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

  it("'Histórico' (F8) é um link real para /historico, não marcado como página atual quando active='dashboard'", () => {
    render(<Sidebar active="dashboard" />);

    const historicoLink = screen.getByRole("link", { name: /histórico/i });
    expect(historicoLink).toHaveAttribute("href", "/historico");
    expect(historicoLink).not.toHaveAttribute("aria-current");
  });

  it("inclui o ThemeToggle (F5) reaproveitado, não recriado", () => {
    render(<Sidebar active="dashboard" />);

    expect(screen.getByRole("switch", { name: /modo escuro/i })).toBeInTheDocument();
  });

  it("com active='historico', Dashboard deixa de ser a página atual e Histórico passa a ser", () => {
    render(<Sidebar active="historico" />);

    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /histórico/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("visível só a partir do breakpoint md (hidden no mobile)", () => {
    render(<Sidebar active="dashboard" />);

    expect(
      screen.getByRole("navigation", { name: /navegação principal/i }).closest("aside"),
    ).toHaveClass("hidden", "md:flex");
  });
});
