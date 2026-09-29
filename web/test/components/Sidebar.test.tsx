import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SidebarProvider } from "../../src/components/ui/sidebar";
import { Sidebar, type DashboardRoute } from "../../src/components/Sidebar";

// O `Sidebar` do shadcn/ui exige um `SidebarProvider` ancestral (em produção
// quem monta é o `AppShell`).
function renderSidebar(active: DashboardRoute) {
  return render(
    <SidebarProvider>
      <Sidebar active={active} />
    </SidebarProvider>,
  );
}

describe("Sidebar", () => {
  it("marca o item Dashboard como página atual quando active='dashboard'", () => {
    renderSidebar("dashboard");

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
    expect(dashboardLink).toHaveAttribute("href", "/");
  });

  it("'Histórico' (F8) é um link real para /historico, não marcado como página atual quando active='dashboard'", () => {
    renderSidebar("dashboard");

    const historicoLink = screen.getByRole("link", { name: /histórico/i });
    expect(historicoLink).toHaveAttribute("href", "/historico");
    expect(historicoLink).not.toHaveAttribute("aria-current");
  });

  it("inclui o ThemeToggle (F5) reaproveitado, não recriado", () => {
    renderSidebar("dashboard");

    expect(screen.getByRole("switch", { name: /modo escuro/i })).toBeInTheDocument();
  });

  it("com active='historico', Dashboard deixa de ser a página atual e Histórico passa a ser", () => {
    renderSidebar("historico");

    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /histórico/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("mostra a logo institucional (dark e light) em vez do ícone genérico + 'IFSClima'", () => {
    renderSidebar("dashboard");

    const logos = screen.getAllByRole("img", { name: /jaraguá centro/i });
    expect(logos).toHaveLength(2);
    expect(logos[0]).toHaveAttribute("src", "/jaragua-centro-logo-dark-theme.png");
    expect(logos[1]).toHaveAttribute("src", "/jaragua-centro-logo-light-theme.png");
    expect(screen.queryByText("IFSClima")).not.toBeInTheDocument();
  });

  it("tem o próprio gatilho de recolher, que recolhe para ícones e continua acessível recolhida", () => {
    renderSidebar("dashboard");

    const root = screen
      .getByRole("navigation", { name: /navegação principal/i })
      .closest('[data-slot="sidebar"]');
    const trigger = screen.getByRole("button", { name: /recolher barra lateral/i });
    expect(root).toContainElement(trigger);
    expect(root).toHaveAttribute("data-state", "expanded");

    fireEvent.click(trigger);

    expect(root).toHaveAttribute("data-state", "collapsed");
    // `icon` (e não `offcanvas`): vira trilho de ícones em vez de sumir, então
    // o gatilho — que mora dentro dela — segue ali para expandir de novo.
    expect(root).toHaveAttribute("data-collapsible", "icon");
    expect(root).toContainElement(trigger);
    expect(trigger).toHaveAccessibleName("Expandir barra lateral");

    fireEvent.click(trigger);
    expect(root).toHaveAttribute("data-state", "expanded");
  });

  it("visível só a partir do breakpoint md (hidden no mobile)", () => {
    renderSidebar("dashboard");

    // Raiz do `Sidebar` do shadcn no desktop: `hidden md:block`.
    const root = screen
      .getByRole("navigation", { name: /navegação principal/i })
      .closest('[data-slot="sidebar"]');
    expect(root).toHaveClass("hidden", "md:block");
  });
});
