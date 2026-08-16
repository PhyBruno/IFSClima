import { useId, useLayoutEffect, useRef, useState } from "react";

/**
 * Ícone "i" com tooltip de explicação — pedido do usuário, 2026-08-16, para
 * os cards de Umidade e Índice UV no KPI da última leitura (`SensorGrid`)
 * explicarem como o valor é calculado, sem poluir o card com texto fixo.
 *
 * **Posicionamento calculado (`getBoundingClientRect` + `position: fixed`),
 * não CSS puro (correção, feedback do usuário, 2026-08-16)**: a primeira
 * versão abria sempre para CIMA (`bottom-full`) e centralizada no ícone via
 * `left-1/2 -translate-x-1/2` — quebrado de dois jeitos:
 *
 * 1. Os cards de Umidade/UV ficam logo abaixo do header (topo da página);
 *    abrir pra cima cortava o balão na borda superior da JANELA do
 *    navegador (não dá pra rolar mais pra cima pra ver o resto).
 * 2. Em mobile (grid 2 colunas), um card na coluna da DIREITA empurrava o
 *    balão, centralizado no ícone, pra fora da viewport à direita — sem
 *    nenhum clamp, a largura fixa (`w-44`) simplesmente vazava da tela.
 *
 * A correção mede a posição REAL do botão (`buttonRef`) e da viewport no
 * momento em que o tooltip abre: abre pra BAIXO por padrão (mais espaço
 * disponível on a maioria dos casos, e é onde os 2 cards problemáticos
 * vivem) e só inverte pra cima se não houver espaço abaixo E houver mais
 * espaço acima; horizontalmente, sempre GRUDADO dentro da viewport
 * (`VIEWPORT_MARGIN_PX` de respiro nas bordas), nunca cortado. `position:
 * fixed` (não `absolute`) porque as coordenadas de `getBoundingClientRect`
 * já são relativas à viewport, e assim o cálculo funciona igual não importa
 * quanto a página tenha rolado.
 *
 * **Hover E foco (não só CSS `:hover`)**: `onMouseEnter`/`onFocus` via
 * `useState` (não `group-hover` do Tailwind) para o tooltip abrir também por
 * teclado/toque (`Tab` até o botão, ou tap em mobile) — um `group-hover`
 * puro nunca abriria via teclado. `aria-describedby` liga o botão ao texto
 * (`role="tooltip"`, mesmo padrão já usado pelo tooltip de ponto do
 * `ChartCard.tsx`) para leitores de tela, não só visualmente.
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

/** Largura fixa do balão — usada tanto no CSS quanto no cálculo de clamp horizontal (precisam bater). */
const TOOLTIP_WIDTH_PX = 176;
/** Respiro mínimo entre o balão e a borda da viewport (topo/base/laterais). */
const VIEWPORT_MARGIN_PX = 8;
/** Espaço entre o ícone e o balão. */
const GAP_PX = 6;
/**
 * Altura aproximada do balão — não medida de verdade (o balão só existe no
 * DOM depois de decidir onde colocá-lo, então não há como medir a altura
 * REAL antes de posicionar sem um segundo render). 2-4 linhas de texto a
 * ~10.5px + padding vertical cobre os textos de Umidade/UV atuais com
 * folga; abrir pra cima quando o espaço abaixo é meio apertado (mas ainda
 * daria) é um resultado aceitável — o importante é NUNCA cortar no topo da
 * janela, que é o bug relatado.
 */
const ESTIMATED_HEIGHT_PX = 90;

interface TooltipPosition {
  top: number;
  left: number;
  openUpward: boolean;
}

/** Calcula onde o balão deve ficar (fixed, em px de viewport) a partir da posição real do botão-gatilho. */
function computePosition(buttonRect: DOMRect): TooltipPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spaceBelow = viewportHeight - buttonRect.bottom;
  const spaceAbove = buttonRect.top;
  const openUpward = spaceBelow < ESTIMATED_HEIGHT_PX + GAP_PX && spaceAbove > spaceBelow;

  const idealLeft = buttonRect.left + buttonRect.width / 2 - TOOLTIP_WIDTH_PX / 2;
  const maxLeft = Math.max(
    viewportWidth - TOOLTIP_WIDTH_PX - VIEWPORT_MARGIN_PX,
    VIEWPORT_MARGIN_PX,
  );
  const left = Math.min(Math.max(idealLeft, VIEWPORT_MARGIN_PX), maxLeft);

  return {
    top: openUpward ? buttonRect.top - GAP_PX : buttonRect.bottom + GAP_PX,
    left,
    openUpward,
  };
}

export function InfoTooltip({ label, children, className = "" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  // Recalcula toda vez que abre (não uma vez só) — a página pode ter rolado
  // ou o layout mudado (ex. viewport redimensionada) entre uma abertura e a
  // próxima do MESMO tooltip.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const button = buttonRef.current;
    if (!button) {
      return;
    }

    setPosition(computePosition(button.getBoundingClientRect()));
  }, [open]);

  return (
    <span className={`inline-flex ${className}`.trim()}>
      <button
        ref={buttonRef}
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
      {open && position ? (
        <span
          id={tooltipId}
          role="tooltip"
          data-testid="info-tooltip"
          className="pointer-events-none fixed z-20 rounded-md border border-border-default bg-surface-card px-2 py-1.5 text-[10.5px] font-normal leading-snug text-text-secondary shadow-lg"
          style={{
            top: position.top,
            left: position.left,
            width: TOOLTIP_WIDTH_PX,
            transform: position.openUpward ? "translateY(-100%)" : undefined,
          }}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

export default InfoTooltip;
