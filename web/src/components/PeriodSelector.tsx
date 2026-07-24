/**
 * `PeriodSelector` — docs/design-extraction.md §5.3.
 *
 * Decisões de API que não estavam 100% determinadas pela extração:
 *
 * - **"buttons" vs. "pill" não são props separadas.** A extração confirma
 *   que desktop já é `radius: 8px` fixo e só o *mobile* vira pill (§3.2/
 *   §5.3) — ou seja, é a MESMA árvore de botões nos dois casos, só o radius
 *   muda por breakpoint. Implementado com uma única classe responsiva
 *   (`rounded-full md:rounded-lg`) no mesmo componente/markup — não existe
 *   um modo "buttons" e um modo "pill" de fato, é sempre o mesmo grupo. O
 *   nome "pill"/"buttons" do prompt é conceitual, não uma prop.
 *
 * - **"dropdown" é uma variante estruturalmente diferente** (um único botão
 *   fechado, não um grupo) — por isso vive atrás de `mode: "dropdown"`, um
 *   union discriminado com o modo padrão (grupo de opções). Não implementa
 *   o menu que abre (fora do escopo desta tarefa) — só expõe `onClick` para
 *   quem compõe (F6) plugar a lógica de abrir/fechar depois.
 *
 * - **`role="group"` + `aria-pressed` por botão** (toggle-button pattern),
 *   não `radiogroup`/`radio`. Escolhido porque os itens já são `<button>`
 *   nativos operáveis com Tab (sem precisar reimplementar navegação por
 *   setas que o padrão `radiogroup` exige do dono da página para ser
 *   totalmente correto) — `aria-pressed` comunica "selecionado" sem exigir
 *   esse gerenciamento de foco adicional, e é o padrão recomendado pelas
 *   WAI-ARIA Authoring Practices para grupos de alternância selecionável
 *   única quando simplicidade de teclado é suficiente (como é aqui).
 *
 * - **"▾" do modo dropdown é decorativo (`aria-hidden`)**: diferente da seta
 *   de delta do `StatCard` (que carrega informação direcional e por isso é
 *   texto visível, não decorativa), aqui o nome acessível do botão já é
 *   `label` (o texto visível "Últimas 24h"), e "▾" só reforça visualmente
 *   "isto abre algo" — remover o glifo não perde nenhuma informação nova.
 *
 * - **Opção "Personalizado" (custom range)**: não recebe tratamento
 *   especial — é só mais uma entrada em `options`, sem abrir calendário
 *   (fora do escopo de T5.3, ver prompt). Quem compõe decide o que fazer no
 *   `onChange` quando `value === "custom"`.
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

const GROUP_ARIA_LABEL = "Período";

export function PeriodSelector(props: PeriodSelectorProps) {
  if (props.mode === "dropdown") {
    const { label, onClick, className = "" } = props;

    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-default bg-surface-card px-[13px] py-[7px] text-xs font-semibold text-text-secondary ${className}`.trim()}
      >
        <span>{label}</span>
        <span aria-hidden="true">▾</span>
      </button>
    );
  }

  const { options, value, onChange, className = "" } = props;

  return (
    <div
      role="group"
      aria-label={GROUP_ARIA_LABEL}
      className={`flex gap-2 overflow-x-auto ${className}`.trim()}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`shrink-0 whitespace-nowrap rounded-full px-[13px] py-[7px] text-xs font-semibold transition-colors md:rounded-lg ${
              active
                ? "bg-brand-primary text-white"
                : "border border-border-default bg-surface-card text-text-tertiary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default PeriodSelector;
