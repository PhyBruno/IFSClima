import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BottomNav } from "./BottomNav";
import { Sidebar, type DashboardRoute } from "./Sidebar";

/**
 * Layout comum das páginas (dashboard e histórico) no padrão do shadcn/ui:
 * `SidebarProvider` + `Sidebar` (desktop) + `SidebarInset` (o `<main>`) com
 * header fixo no topo, e `BottomNav` no mobile.
 *
 * O `SidebarTrigger` só aparece a partir de `md:` — no mobile a navegação é a
 * `BottomNav`, e o `pb-28` reserva espaço para ela não cobrir o fim da página.
 */
export interface AppShellProps {
  active: DashboardRoute;
  /** Título curto exibido no header fixo (breadcrumb da página). */
  section: string;
  children: ReactNode;
}

export function AppShell({ active, section, children }: AppShellProps) {
  return (
    <SidebarProvider>
      <Sidebar active={active} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:rounded-t-xl">
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <Separator
            orientation="vertical"
            className="mr-1 hidden data-[orientation=vertical]:h-4 md:block"
          />
          <span className="text-sm font-medium">{section}</span>
        </header>
        <div className="flex-1 px-4 pt-6 pb-28 md:px-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </div>
      </SidebarInset>
      <BottomNav active={active} />
    </SidebarProvider>
  );
}

export default AppShell;
