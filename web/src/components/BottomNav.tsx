import { DASHBOARD_NAV_ICON, HISTORICO_NAV_ICON, type DashboardRoute } from "./Sidebar";

/**
 * `BottomNav` (F6 T6.5 — docs/design-extraction.md §5.5) — navegação fixa do
 * mobile (`md:hidden`; ver `Sidebar` para o equivalente desktop). Mesmas
 * decisões de `Sidebar`: "Histórico" (F8) desabilitado/sem link, e nenhum
 * indicador de conexão aqui (vive só no header, ver `DashboardPage`).
 *
 * `position: fixed` no rodapé — o chamador (`DashboardPage`) precisa reservar
 * espaço (`padding-bottom`) no conteúdo pra não ficar coberto por esta barra
 * em telas mobile.
 */
export interface BottomNavProps {
  active: DashboardRoute;
  className?: string;
}

export function BottomNav({ active, className = "" }: BottomNavProps) {
  return (
    <nav
      aria-label="Navegação principal"
      className={`fixed inset-x-0 bottom-0 z-10 flex border-t border-border-default bg-surface-sidebar/95 px-2 py-1.5 md:hidden ${className}`.trim()}
    >
      <a
        href="/"
        aria-current={active === "dashboard" ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 rounded-10 py-1.5 text-[11px] font-medium ${
          active === "dashboard" ? "text-nav-active-text" : "text-text-tertiary"
        }`}
      >
        {DASHBOARD_NAV_ICON}
        Dashboard
      </a>
      <span
        aria-disabled="true"
        className="flex flex-1 flex-col items-center gap-0.5 rounded-10 py-1.5 text-[11px] font-medium text-text-disabled"
      >
        {HISTORICO_NAV_ICON}
        Histórico
      </span>
    </nav>
  );
}

export default BottomNav;
