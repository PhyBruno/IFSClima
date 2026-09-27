import type { ReactNode } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/**
 * Estado vazio genérico (ícone opcional + título + descrição), montado sobre
 * o `Empty` do shadcn/ui. Usado pela tabela de histórico, pelos gráficos sem
 * dados e pelo `SensorGrid` quando a estação ainda não enviou leitura.
 *
 * O título carrega `role="heading"` (nível 3): o `EmptyTitle` do shadcn é uma
 * `div`, e leitores de tela/testes (`getByRole("heading")`) precisam
 * identificar a hierarquia.
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({ icon, title, description, className }: EmptyStateProps) {
  return (
    <Empty className={cn("py-10", className)}>
      <EmptyHeader>
        {icon ? (
          <EmptyMedia variant="icon" aria-hidden="true">
            {icon}
          </EmptyMedia>
        ) : null}
        <EmptyTitle role="heading" aria-level={3}>
          {title}
        </EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}

export default EmptyState;
