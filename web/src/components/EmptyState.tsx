import type { ReactNode } from "react";

/**
 * Estado vazio genérico — docs/design-extraction.md §5.7/§8.6 documentam o
 * caso concreto observado (tabela de histórico vazia): ícone + título
 * "Nenhum dado no período" + subtítulo "Ajuste o intervalo de datas ou os
 * sensores selecionados", centralizado. Generalizado aqui (icon/title/
 * description) para ser reaproveitável em outros contextos futuros (F6/F8).
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({ icon, title, description, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 py-10 text-center ${className}`.trim()}
    >
      {icon ? (
        // Cor do ícone: §8.6 confirma por render o hex exato #d1d5db para o
        // ícone da tabela vazia (light), mas esse valor não tem um token
        // semântico próprio no tema (não é text.faint #c1c5cb nem nenhum
        // outro token nomeado) — em vez de inventar um novo hex, reaproveitamos
        // `text.faint`, o tom mais próximo já existente com o mesmo papel
        // visual (elemento decorativo/apagado), documentado aqui em vez de
        // adicionar uma CSS var só para esta diferença de ~1 tom de cinza.
        <div aria-hidden="true" className="text-text-faint">
          {icon}
        </div>
      ) : null}
      {/* Heading semântico (não uma div genérica) — permite que leitores de
          tela e testes (getByRole('heading')) identifiquem a hierarquia. */}
      <h3 className="text-sm font-medium text-text-secondary">{title}</h3>
      {description ? <p className="text-xs text-text-muted">{description}</p> : null}
    </div>
  );
}

export default EmptyState;
