import { useState } from "react";

export type Theme = "dark" | "light";

/**
 * Switch "Modo escuro" — docs/design-extraction.md §8.7 documenta os dois
 * estados exatos (confirmados por render, um em cada mockup):
 *
 *   Estado | Trilho            | Knob   | Posição   | Sombra do knob
 *   -------|--------------------|--------|-----------|--------------------------
 *   Off    | toggle.track-off   | branco | left: 2px | rgba(0,0,0,0.15) 0 1px 2px
 *   On     | toggle.track-on    | branco | right: 2px| rgba(0,0,0,0.3) 0 1px 2px
 *
 * O mockup "Off" foi visto no tema light (dark mode desligado) e o "On" no
 * mockup dark (dark mode ligado) — ou seja, fisicamente "On"/verde
 * corresponde a "tema escuro ativo". Por isso `aria-checked`/o trilho "on"
 * aqui representam `currentTheme === "dark"`.
 *
 * Mecanismo (T5.2b, ver src/styles/theme.css): tema claro = atributo
 * `data-theme="light"` num ancestral (tipicamente `<html>`); ausência do
 * atributo (ou `data-theme="dark"` explícito) = escuro, que é o default
 * (D16). Este componente é não-controlado por padrão (estado interno,
 * aplica o efeito colateral em `document.documentElement` só ao clicar,
 * nunca no mount) — decisão de API: evitar side-effects surpresa caso outra
 * parte da aplicação (ex. leitura de localStorage em F6) já tenha definido
 * o atributo antes deste componente montar. Props `theme`/`onChange`
 * permitem uso controlado, se um consumidor futuro precisar.
 */
export interface ThemeToggleProps {
  /** Tema controlado externamente. Se omitido, o componente é não-controlado. */
  theme?: Theme;
  /** Chamado com o novo tema após o clique (controlado ou não). */
  onChange?: (theme: Theme) => void;
  className?: string;
}

const ACCESSIBLE_NAME = "Modo escuro";

export function ThemeToggle({ theme, onChange, className = "" }: ThemeToggleProps) {
  const isControlled = theme !== undefined;
  // Não-controlado: nasce em "dark" (default do produto, D16). Não aplicamos
  // nada em `document.documentElement` aqui no mount — só ao clicar.
  const [internalTheme, setInternalTheme] = useState<Theme>("dark");
  const currentTheme = isControlled ? (theme as Theme) : internalTheme;
  const isDark = currentTheme === "dark";

  const handleClick = () => {
    const next: Theme = isDark ? "light" : "dark";

    if (!isControlled) {
      setInternalTheme(next);
      // Setamos "dark" explicitamente ao voltar pro escuro (em vez de
      // remover o atributo) — ambas as formas são válidas pelo mecanismo
      // ("ausência do atributo OU data-theme='dark' explícito" = escuro),
      // explícito é mais simples de testar e não depende de qual estado o
      // atributo tinha antes deste componente existir.
      document.documentElement.dataset.theme = next;
    }

    onChange?.(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={ACCESSIBLE_NAME}
      onClick={handleClick}
      className={`relative inline-flex h-[19px] w-[34px] shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none ${
        isDark ? "bg-toggle-track-on" : "bg-toggle-track-off"
      } ${className}`.trim()}
    >
      {/*
        Posição do knob: o design usa `left: 2px` (off) / `right: 2px` (on).
        Implementamos com uma única propriedade `left`, calculando o
        equivalente numérico de `right: 2px` (trilho 34px − knob 15px − 2px
        = 17px) — mesmo resultado visual, mais simples que alternar
        left/right condicionalmente.
      */}
      <span
        aria-hidden="true"
        className={`absolute top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full bg-toggle-knob transition-[left] duration-150 motion-reduce:transition-none ${
          isDark ? "left-[17px] shadow-toggle-on" : "left-[2px] shadow-toggle-off"
        }`}
      />
    </button>
  );
}

export default ThemeToggle;
