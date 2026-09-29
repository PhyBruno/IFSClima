import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BottomNav } from "./BottomNav";
import { Sidebar, type DashboardRoute } from "./Sidebar";

/**
 * Layout comum das páginas (dashboard e histórico) no padrão do shadcn/ui:
 * `SidebarProvider` + `Sidebar` (desktop) + `SidebarInset` (o `<main>`), e
 * `BottomNav` no mobile.
 *
 * Sem header fixo: o gatilho de recolher mora na própria `Sidebar`. O `pb-28`
 * reserva espaço para a `BottomNav` não cobrir o fim da página no mobile.
 */
export interface AppShellProps {
  active: DashboardRoute;
  children: ReactNode;
}

export function AppShell({ active, children }: AppShellProps) {
  return (
    <SidebarProvider>
      <Sidebar active={active} />
      <SidebarInset>
        <div className="flex-1 px-4 pt-6 pb-28 md:px-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </div>
      </SidebarInset>
      <BottomNav active={active} />
    </SidebarProvider>
  );
}

export default AppShell;
