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

  it("'Histórico' aparece desabilitado (F8 ainda não existe como página) — não é um link", () => {
    render(<BottomNav active="dashboard" />);

    expect(screen.queryByRole("link", { name: /histórico/i })).not.toBeInTheDocument();
    const historico = screen.getByText("Histórico").closest('[aria-disabled="true"]');
    expect(historico).toBeInTheDocument();
  });

  it("com active='historico' (uso futuro por F8), Dashboard deixa de ser a página atual", () => {
    render(<BottomNav active="historico" />);

    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
  });

  it("visível só até o breakpoint md (hidden no desktop)", () => {
    render(<BottomNav active="dashboard" />);

    expect(screen.getByRole("navigation", { name: /navegação principal/i })).toHaveClass("md:hidden", "fixed");
  });
});
