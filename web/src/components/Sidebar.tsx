import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

export type DashboardRoute = "dashboard" | "historico";

/** Ícone genérico de navegação (não é um sensor — não depende do inventário não extraído em T5.1/T5.1b). */
export const DASHBOARD_NAV_ICON: ReactNode = (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" aria-hidden="true">
    <path
      d="M4 12 12 4l8 8"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 10v9h12v-9"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const HISTORICO_NAV_ICON: ReactNode = (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={2} />
    <path
      d="M12 8v4l3 2"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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
 * **"Histórico" agora é um link real (F8 T8.6).** Até T8.5, F8 ainda não
 * tinha página implementada, então o item aparecia desabilitado
 * (`aria-disabled`, sem `href`) só por fidelidade ao design. `/historico`
 * agora existe de verdade (`pages/HistoryPage.tsx`, roteada em `main.tsx`),
 * então este link segue o MESMO tratamento de `aria-current`/estado ativo já
 * usado por "Dashboard" — nenhum destino novo criado aqui, só destravado.
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
      // md:fixed (feedback do usuário, 2026-07-27): antes a sidebar era só
      // um item flex normal, então crescia junto com o conteúdo da página —
      // em telas mais baixas, o botão de tema (`mt-auto`, fim da sidebar)
      // ficava abaixo da dobra e exigia scroll pra alcançar. Fixa na
      // viewport (`inset-y-0 left-0`) e com scroll próprio
      // (`overflow-y-auto`) resolve sem depender da altura do conteúdo ao
      // lado; `DashboardPage`/`HistoryPage` reservam espaço no `main` pra
      // compensar o que a sidebar deixa de ocupar no fluxo normal.
      className={`hidden shrink-0 flex-col gap-6 border-r border-border-default bg-surface-sidebar p-4 md:flex md:fixed md:inset-y-0 md:left-0 md:w-56 md:overflow-y-auto ${className}`.trim()}
    >
      <div className="flex items-center">
        {/*
          Logo institucional por tema (pedido do usuário, 2026-08-19),
          substitui o ícone genérico + "IFSClima". Troca dark/light via CSS
          (.logo-dark-theme/.logo-light-theme em theme.css), mesmo mecanismo
          data-theme já usado pras cores — sem estado React duplicado do que
          o ThemeToggle já controla em document.documentElement.
          Variação HORIZONTAL da marca (proporção ~3.2:1, pedido do usuário)
          — h-12 + w-auto (nunca w-* fixo) preserva essa proporção original em
          qualquer resolução; max-w-full evita overflow em telas estreitas.
          h-12 (feedback do usuário, 2026-08-19): h-8 deixava vazio de sobra
          antes do <div className="border-t"> logo abaixo (gap-6 fixo do
          <aside> some visualmente melhor com a logo maior preenchendo a linha).
        */}
        <img
          src="/jaragua-centro-logo-dark-theme.png"
          alt="Jaraguá Centro"
          className="logo-dark-theme h-12 w-auto max-w-full object-contain"
        />
        <img
          src="/jaragua-centro-logo-light-theme.png"
          alt="Jaraguá Centro"
          className="logo-light-theme h-12 w-auto max-w-full object-contain"
        />
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
        <a
          href="/historico"
          aria-current={active === "historico" ? "page" : undefined}
          className={`flex items-center gap-2 rounded-10 px-3 py-2 text-sm font-medium transition-colors ${
            active === "historico"
              ? "bg-nav-active-bg text-nav-active-text"
              : "text-text-tertiary hover:text-text-primary"
          }`}
        >
          {HISTORICO_NAV_ICON}
          Histórico
        </a>
      </nav>

      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-text-tertiary">
        <span>Modo escuro</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}

export default Sidebar;
