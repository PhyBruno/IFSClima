import { useRef, useState } from "react";
import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Ícone "i" com explicação em tooltip (shadcn `Tooltip`, Radix) — usado nos
 * cards de Umidade e Índice UV para explicar como o valor é calculado.
 *
 * O Radix já cuida de posicionamento com colisão (vira de lado/clampa na
 * viewport — os bugs de corte no topo e na borda direita que o tooltip
 * artesanal anterior precisava resolver na mão) e abre por hover e foco.
 *
 * **Toque (mobile)**: o Tooltip do Radix não abre com tap — o Trigger fecha
 * no `pointerdown` e no `click`, e o conteúdo trata o `pointerdown` no
 * próprio botão como "clique fora". Por isso o `open` é controlado aqui: os
 * handlers do botão chamam `preventDefault()` (o Radix pula o próprio
 * handler quando o evento já vem `defaultPrevented`), o conteúdo ignora o
 * "clique fora" vindo do botão, e o clique alterna o estado. Sem isso o
 * segundo toque não fechava o balão (o `pointerdown` fechava e o `click`
 * reabria).
 *
 * Traz o próprio `TooltipProvider` para funcionar em qualquer lugar da árvore
 * (inclusive em testes isolados) sem depender de um provider global.
 */
export interface InfoTooltipProps {
  /** Rótulo acessível do botão, ex. "Como a umidade é calculada". */
  label: string;
  children: string;
  className?: string;
}

export function InfoTooltip({ label, children, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={label}
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              setOpen((current) => !current);
            }}
            className={cn(
              "inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
              className,
            )}
          >
            <InfoIcon className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          data-testid="info-tooltip"
          className="max-w-60 text-pretty"
          collisionPadding={8}
          onPointerDownOutside={(event) => {
            if (triggerRef.current?.contains(event.target as Node)) {
              event.preventDefault();
            }
          }}
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default InfoTooltip;
