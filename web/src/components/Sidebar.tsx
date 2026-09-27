import type { ReactNode } from "react";
import { HistoryIcon, LayoutDashboardIcon } from "lucide-react";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "./ThemeToggle";

export type DashboardRoute = "dashboard" | "historico";

export const DASHBOARD_NAV_ICON: ReactNode = <LayoutDashboardIcon aria-hidden="true" />;
export const HISTORICO_NAV_ICON: ReactNode = <HistoryIcon aria-hidden="true" />;

export const NAV_ITEMS: { route: DashboardRoute; href: string; label: string; icon: ReactNode }[] =
  [
    { route: "dashboard", href: "/", label: "Dashboard", icon: DASHBOARD_NAV_ICON },
    { route: "historico", href: "/historico", label: "Histórico", icon: HISTORICO_NAV_ICON },
  ];

/**
 * `Sidebar` — navegação do desktop sobre o `Sidebar` do shadcn/ui (variante
 * `inset`, recolhível pelo `SidebarTrigger` do header). Precisa de um
 * `SidebarProvider` ancestral (montado pelas páginas). No mobile a navegação
 * é a `BottomNav`; o Sheet do shadcn fica disponível mas sem gatilho visível.
 *
 * Logo institucional por tema: duas `<img>` trocadas pela classe `dark` do
 * `<html>` (`dark:block`/`dark:hidden`), sem estado React duplicado do que o
 * `ThemeToggle` já controla. Variação horizontal (~3.2:1): `h-12 w-auto`
 * preserva a proporção.
 *
 * Sem painel de status aqui: o único indicador de conexão do produto é a
 * notificação flutuante de offline do `DashboardPage`.
 */
export interface SidebarProps {
  active: DashboardRoute;
  className?: string;
}

export function Sidebar({ active, className }: SidebarProps) {
  return (
    <SidebarRoot variant="inset" className={className}>
      <SidebarHeader className="px-3 pt-3">
        <img
          src="/jaragua-centro-logo-dark-theme.png"
          alt="Jaraguá Centro"
          className="hidden h-12 w-auto max-w-full object-contain object-left dark:block"
        />
        <img
          src="/jaragua-centro-logo-light-theme.png"
          alt="Jaraguá Centro"
          className="block h-12 w-auto max-w-full object-contain object-left dark:hidden"
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Estação meteorológica</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Navegação principal">
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
                  const isActive = item.route === active;
                  return (
                    <SidebarMenuItem key={item.route}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <a href={item.href} aria-current={isActive ? "page" : undefined}>
                          {item.icon}
                          <span>{item.label}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70">
          <span>Modo escuro</span>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </SidebarRoot>
  );
}

export default Sidebar;
