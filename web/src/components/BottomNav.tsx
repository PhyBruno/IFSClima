import { cn } from "@/lib/utils";
import { NAV_ITEMS, type DashboardRoute } from "./Sidebar";

/**
 * `BottomNav` — navegação fixa do mobile (`md:hidden`; no desktop é a
 * `Sidebar`). Mesmos itens e mesmo `aria-current` da `Sidebar`.
 *
 * `position: fixed` no rodapé — as páginas reservam `padding-bottom` para o
 * conteúdo não ficar coberto. Fundo sólido (não translúcido): o conteúdo não
 * pode aparecer "por trás" da barra ao rolar.
 */
export interface BottomNavProps {
  active: DashboardRoute;
  className?: string;
}

export function BottomNav({ active, className }: BottomNavProps) {
  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 flex border-t bg-background px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:hidden",
        className,
      )}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.route === active;
        return (
          <a
            key={item.route}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors [&_svg]:size-5",
              isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

export default BottomNav;
