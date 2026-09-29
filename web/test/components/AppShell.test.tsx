import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AppShell } from "../../src/components/AppShell";

/**
 * `AppShell` — layout comum das páginas: `Sidebar` (desktop, com o próprio
 * gatilho de recolher) + conteúdo, e `BottomNav` (mobile). As duas navegações
 * ficam no DOM ao mesmo tempo (a visibilidade é por breakpoint via CSS).
 */
describe("AppShell", () => {
  it("renderiza a Sidebar e a BottomNav, ambas com o item ativo marcado como página atual", () => {
    render(
      <AppShell active="historico">
        <p>conteúdo</p>
      </AppShell>,
    );

    // Duas navegações principais: a da Sidebar e a da BottomNav.
    const navs = screen.getAllByRole("navigation", { name: /navegação principal/i });
    expect(navs).toHaveLength(2);

    for (const nav of navs) {
      expect(within(nav).getByRole("link", { name: /histórico/i })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(within(nav).getByRole("link", { name: /dashboard/i })).not.toHaveAttribute(
        "aria-current",
      );
    }
  });

  it("com active='dashboard', só o item Dashboard fica como página atual", () => {
    render(
      <AppShell active="dashboard">
        <p>conteúdo</p>
      </AppShell>,
    );

    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(2);
    for (const link of current) {
      expect(link).toHaveAttribute("href", "/");
    }
  });

  it("não tem header fixo: sem linha de título da seção, e o gatilho de recolher fica dentro da Sidebar", () => {
    render(
      <AppShell active="historico">
        <p>conteúdo</p>
      </AppShell>,
    );

    expect(screen.queryByRole("banner")).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: /recolher barra lateral/i });
    expect(trigger.closest('[data-slot="sidebar"]')).not.toBeNull();
    expect(
      within(screen.getByRole("main")).queryByRole("button", { name: /recolher/i }),
    ).toBeNull();
  });

  it("renderiza os children dentro da área principal", () => {
    render(
      <AppShell active="dashboard">
        <p>Conteúdo da página</p>
      </AppShell>,
    );

    const main = screen.getByRole("main");
    expect(within(main).getByText("Conteúdo da página")).toBeInTheDocument();
  });
});
