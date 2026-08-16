import { useId, useState } from "react";

/**
 * Ícone "i" com tooltip de explicação — pedido do usuário, 2026-08-16, para
 * os cards de Umidade e Índice UV no KPI da última leitura (`SensorGrid`)
 * explicarem como o valor é calculado, sem poluir o card com texto fixo.
 *
 * **Hover E foco (não só CSS `:hover`)**: `onMouseEnter`/`onFocus` via
 * `useState` (não `group-hover` do Tailwind) para o tooltip abrir também por
 * teclado (`Tab` até o botão) — um `group-hover` puro nunca abriria via
 * teclado. `aria-describedby` liga o botão ao texto (`role="tooltip"`,
 * mesmo padrão já usado pelo tooltip de ponto do `ChartCard.tsx`) para
 * leitores de tela, não só visualmente.
 *
 * `type="button"` explícito: sem isso, dentro de qualquer `<form>` futuro
 * este botão se comportaria como submit por padrão do HTML.
 */
export interface InfoTooltipProps {
  /** Rótulo acessível do botão, ex. "Como a umidade é calculada". */
  label: string;
  children: string;
  className?: string;
}

export function InfoTooltip({ label, children, className = "" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span className={`relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-text-faint text-[8.5px] font-bold leading-none text-text-faint"
      >
        i
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          data-testid="info-tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 w-44 -translate-x-1/2 rounded-md border border-border-default bg-surface-card px-2 py-1.5 text-[10.5px] font-normal leading-snug text-text-secondary shadow-lg"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

export default InfoTooltip;
