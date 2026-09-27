import { useState } from "react";
import { Switch } from "@/components/ui/switch";

export type Theme = "dark" | "light";

/**
 * Switch "Modo escuro" (shadcn `Switch`, Radix). Ligado = tema escuro.
 *
 * Mecanismo: convenção do shadcn/ui — classe `dark` no `<html>` (o
 * `index.html` já nasce com `class="dark"`, escuro é o default do produto).
 * Não-controlado por padrão: nasce "dark" e só toca em
 * `document.documentElement` ao alternar, nunca no mount. `theme`/`onChange`
 * permitem uso controlado.
 */
export interface ThemeToggleProps {
  /** Tema controlado externamente. Se omitido, o componente é não-controlado. */
  theme?: Theme;
  /** Chamado com o novo tema após a troca (controlado ou não). */
  onChange?: (theme: Theme) => void;
  className?: string;
}

export function ThemeToggle({ theme, onChange, className }: ThemeToggleProps) {
  const isControlled = theme !== undefined;
  const [internalTheme, setInternalTheme] = useState<Theme>("dark");
  const isDark = (isControlled ? theme : internalTheme) === "dark";

  function handleCheckedChange(checked: boolean) {
    const next: Theme = checked ? "dark" : "light";

    if (!isControlled) {
      setInternalTheme(next);
      document.documentElement.classList.toggle("dark", next === "dark");
    }

    onChange?.(next);
  }

  return (
    <Switch
      aria-label="Modo escuro"
      checked={isDark}
      onCheckedChange={handleCheckedChange}
      className={className}
    />
  );
}

export default ThemeToggle;
