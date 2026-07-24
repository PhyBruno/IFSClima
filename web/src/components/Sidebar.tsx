import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

export type DashboardRoute = "dashboard" | "historico";

/** Ícone genérico de navegação (não é um sensor — não depende do inventário não extraído em T5.1/T5.1b). */
export const DASHBOARD_NAV_ICON: ReactNode = (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" aria-hidden="true">
    <path d="M4 12 12 4l8 8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 10v9h12v-9" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const HISTORICO_NAV_ICON: ReactNode = (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={2} />
    <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * `Sidebar` (F6 T6.5 — docs/design-extraction.md §5.5) — navegação fixa do
 * desktop (`hidden md:flex`; ver `BottomNav` para o equivalente mobile).
 * Faltava na primeira entrega de T6.5 (feedback do usuário, 2026-07-24) —
 * `f8-history-export/design.md` já cita "layout/nav compartilhado com o
 * dashboard (F6)" como dependência, então esta é a peça que faltava, não uma
 * feature nova de F8.
 *
 * **"Histórico" desabilitado.** F8 (`.specs/features/f8-history-export`)
 * ainda não tem página implementada — o item aparece (fidelidade ao design,
 * usuário quer VER a navegação) mas não é um link real (`aria-disabled`, sem
 * `href`), pra não apontar pra uma rota que só re-renderiza o dashboard (não
 * há router de verdade, ver `main.tsx`) nem parecer quebrado.
 *
 * **Sem painel de status aqui.** O design original (§5.4) tem um card
 * "Online" sempre visível no rodapé da sidebar — omitido de propósito: o
 * único indicador de conexão do produto vive no header do conteúdo
 * (`DashboardPage`) e só aparece quando a estação está offline (regra do
 * usuário, 2026-07-24, ver docstring de `DashboardPage`) — duplicar aqui
 * violaria essa regra em telas desktop.
 */
export interface SidebarProps {
  active: DashboardRoute;
  className?: string;
}

export function Sidebar({ active, className = "" }: SidebarProps) {
  return (
    <aside
      className={`hidden shrink-0 flex-col gap-6 border-r border-border-default bg-surface-sidebar p-4 md:flex md:w-56 ${className}`.trim()}
    >
      <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-10 bg-surface-chip text-brand-primary"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={2} />
          </svg>
        </span>
        IFSClima
      </div>

      <div className="border-t border-border-subtle" />

      <nav aria-label="Navegação principal" className="flex flex-col gap-1">
        <a
          href="/"
          aria-current={active === "dashboard" ? "page" : undefined}
          className={`flex items-center gap-2 rounded-10 px-3 py-2 text-sm font-medium transition-colors ${
            active === "dashboard"
              ? "bg-nav-active-bg text-nav-active-text"
              : "text-text-tertiary hover:text-text-primary"
          }`}
        >
          {DASHBOARD_NAV_ICON}
          Dashboard
        </a>
        <span
          aria-disabled="true"
          className="flex items-center gap-2 rounded-10 px-3 py-2 text-sm font-medium text-text-disabled"
        >
          {HISTORICO_NAV_ICON}
          Histórico
          <span className="ml-auto text-[10px] font-semibold uppercase text-text-faint">Em breve</span>
        </span>
      </nav>

      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-text-tertiary">
        <span>Modo escuro</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}

export default Sidebar;
