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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
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
 * `inset`). Recolhível pelo próprio `SidebarTrigger`, no topo da sidebar:
 * `collapsible="icon"` (e não `offcanvas`) porque recolher vira um trilho de
 * ícones em vez de sumir — senão o gatilho, que mora dentro dela, sumiria
 * junto. Recolhida, a logo e os textos somem e os itens ganham tooltip.
 * Precisa de um `SidebarProvider` ancestral (montado pelo `AppShell`). No mobile a navegação
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
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <TooltipProvider>
      <SidebarRoot variant="inset" collapsible="icon" className={className}>
        <SidebarHeader className="flex-row items-center gap-2 px-3 pt-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
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
          </div>
          <SidebarTrigger
            aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            title={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            className="shrink-0"
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
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
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
          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <span className="group-data-[collapsible=icon]:hidden">Modo escuro</span>
            <ThemeToggle />
          </div>
        </SidebarFooter>
      </SidebarRoot>
    </TooltipProvider>
  );
}

export default Sidebar;
