import type { HTMLAttributes, ReactNode } from "react";

export type CardPadding = "none" | "sm" | "md";

/**
 * Wrapper genérico de superfície — fundação usada por praticamente todo o
 * resto do design (StatCard/ChartCard/tabela em T5.3b vão compor sobre
 * isto). Estrutura mínima observada em docs/design-extraction.md: fundo
 * `surface.card`, borda 1px `border.default`, radius 16px desktop / 14px
 * mobile (§3.2) e SEM sombra por padrão — no dark `shadow-card` resolve
 * para `none` (§3.3); no light existe uma sombra sutil, mas só para
 * StatCard "normal" e o date range picker, não para todo Card (§8.8:
 * ChartCard/tabela/sidebar continuam flat mesmo no light) — por isso a
 * sombra é opt-in via prop `shadow`, nunca aplicada por padrão.
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
  /**
   * Padding interno do card. A extração não define um padding único "do
   * Card" — StatCard usa 16px desktop/11px mobile, ChartCard 20px/12-14px
   * (§3.1) — cada composto de T5.3b decide seu próprio espaçamento exato.
   * `padding="none"` existe justamente para permitir que um consumidor
   * aplique seu próprio padding exato via `className` sem colidir com uma
   * classe `p-*` já vinda do Card (o projeto não usa tailwind-merge, então
   * duas classes `p-*` simultâneas teriam um vencedor ambíguo dependendo da
   * ordem de geração do Tailwind, não da ordem no atributo `className`).
   */
  padding?: CardPadding;
  /**
   * Aplica `shadow-card` (sombra sutil que só existe de fato no tema claro
   * — no dark a CSS var resolve para `none`, ver theme.css). Ver §8.8: só
   * StatCard "normal" e o date range picker têm essa sombra no light; o
   * restante (ChartCard, tabela, sidebar, empty-states) permanece flat. Por
   * isso não é o default — o consumidor liga explicitamente.
   */
  shadow?: boolean;
  /**
   * Sobrescreve por completo as classes de border-radius padrão
   * (`rounded-14 md:rounded-2xl`, §3.2: 14px mobile / 16px desktop). Existe
   * para composições que precisam de um radius fixo diferente do genérico
   * (ex. StatusPill variante "card", 12px/`rounded-xl`, §5.4) sem que duas
   * classes `rounded-*` concorrentes fiquem na mesma árvore de classes.
   */
  radius?: string;
}

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
};

const DEFAULT_RADIUS_CLASSES = "rounded-14 md:rounded-2xl";

export function Card({
  children,
  className = "",
  padding = "md",
  shadow = false,
  radius,
  ...rest
}: CardProps) {
  const classes = [
    "bg-surface-card",
    "border",
    "border-border-default",
    radius ?? DEFAULT_RADIUS_CLASSES,
    PADDING_CLASSES[padding],
    shadow ? "shadow-card" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export default Card;
