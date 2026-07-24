import type { HTMLAttributes } from "react";

/**
 * `Skeleton` — bloco de placeholder genérico para carregamento inicial (F6
 * T6.4 — spec.md edge case "loading inicial → skeletons (não layout shift)").
 *
 * Sem forma/tamanho próprios de propósito: cada chamador (`SensorGrid`,
 * `ChartsSection`) passa `className` com a MESMA altura/largura do conteúdo
 * final que o placeholder substitui (ex. o mesmo `h-20 w-full` do `<svg>`
 * de `ChartCard`) — é o que evita o layout shift pedido pela spec, não algo
 * que este componente possa garantir sozinho sem saber o que está
 * substituindo.
 *
 * `aria-hidden`: puramente decorativo, não carrega informação própria — um
 * leitor de tela não deve anunciar N blocos "vazios" enquanto os dados
 * carregam, só o conteúdo final quando chegar (mesmo princípio já usado no
 * ícone decorativo de `EmptyState.tsx`).
 *
 * **`bg-surface-skeleton`, não `bg-surface-chip` (revisão — feedback do
 * usuário, 2026-07-24)**: `surface.chip` não tem override no tema claro (não
 * existe um "chip neutro" documentado lá, ver `theme.css`) — um placeholder
 * de carregamento com essa classe ficava escuro mesmo no light (visível ao
 * trocar o período do `ChartsSection`, que troca pra skeleton a cada nova
 * busca). `surface.skeleton` é um token próprio: dark aponta pro mesmo chip
 * (sem mudança ali), light usa o cinza de `border.default`.
 */
export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = "", ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-10 bg-surface-skeleton ${className}`.trim()}
      {...rest}
    />
  );
}

export default Skeleton;
