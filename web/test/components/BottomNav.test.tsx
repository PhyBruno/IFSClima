import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BottomNav } from "../../src/components/BottomNav";

describe("BottomNav", () => {
  it("marca o item Dashboard como página atual quando active='dashboard'", () => {
    render(<BottomNav active="dashboard" />);

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
    expect(dashboardLink).toHaveAttribute("href", "/");
  });

  it("'Histórico' (F8) é um link real para /historico, não marcado como página atual quando active='dashboard'", () => {
    render(<BottomNav active="dashboard" />);

    const historicoLink = screen.getByRole("link", { name: /histórico/i });
    expect(historicoLink).toHaveAttribute("href", "/historico");
    expect(historicoLink).not.toHaveAttribute("aria-current");
  });

  it("com active='historico', Dashboard deixa de ser a página atual e Histórico passa a ser", () => {
    render(<BottomNav active="historico" />);

    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /histórico/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("visível só até o breakpoint md (hidden no desktop)", () => {
    render(<BottomNav active="dashboard" />);

    expect(screen.getByRole("navigation", { name: /navegação principal/i })).toHaveClass(
      "md:hidden",
      "fixed",
    );
  });
});
