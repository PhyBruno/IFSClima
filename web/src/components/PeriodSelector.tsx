import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * `PeriodSelector` — grupo de períodos (Últimas 24h / 7 dias / 30 dias …)
 * com `Button` do shadcn: selecionado = `default`, demais = `outline`.
 *
 * `role="group"` + `aria-pressed` por botão (toggle-button pattern da
 * WAI-ARIA), não `radiogroup` — os itens são `<button>` nativos operáveis
 * com Tab, sem exigir navegação por setas. Por isso não usa o `ToggleGroup`
 * do shadcn, que no modo single vira `role="radio"`.
 *
 * `mode: "dropdown"` é a variante de um único botão fechado (rótulo + ▾);
 * quem compõe pluga o `onClick`.
 */
export interface PeriodOption {
  value: string;
  label: string;
}

export interface PeriodSelectorGroupProps {
  mode?: "buttons";
  options: PeriodOption[];
  /** Valor selecionado (deve casar com `option.value` de uma das opções). */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export interface PeriodSelectorDropdownProps {
  mode: "dropdown";
  /** Texto já formatado, ex. "Últimas 24h". */
  label: string;
  onClick?: () => void;
  className?: string;
}

export type PeriodSelectorProps = PeriodSelectorGroupProps | PeriodSelectorDropdownProps;

export function PeriodSelector(props: PeriodSelectorProps) {
  if (props.mode === "dropdown") {
    const { label, onClick, className } = props;

    return (
      <Button type="button" variant="outline" size="sm" onClick={onClick} className={className}>
        <span>{label}</span>
        <ChevronDownIcon aria-hidden="true" data-icon="inline-end" />
      </Button>
    );
  }

  const { options, value, onChange, className } = props;

  return (
    <div role="group" aria-label="Período" className={cn("flex gap-2 overflow-x-auto", className)}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className="shrink-0 rounded-full md:rounded-lg"
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export default PeriodSelector;
