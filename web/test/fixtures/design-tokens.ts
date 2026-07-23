/**
 * Fonte compartilhada dos tokens de cor esperados (T5.2), usada tanto pelo
 * teste de `tailwind.config.js` quanto pelo teste de `src/styles/theme.css`,
 * para pegar drift entre os dois sem duplicar hex "soltos" em cada arquivo.
 *
 * Valores conferidos contra `docs/design-extraction.md` (T5.1).
 */

/** Categoria -> chave -> hex esperado. */
export const expectedColorTokens: Record<string, Record<string, string>> = {
  surface: {
    page: "#0d1117",
    sidebar: "#12161d",
    card: "#161b22",
    chip: "#1c2129",
  },
  border: {
    default: "#262c35",
    subtle: "#1e232b",
    dashed: "#2a313c",
  },
  text: {
    primary: "#f3f4f6",
    secondary: "#d1d5db",
    tertiary: "#9ca3af",
    muted: "#6b7280",
    faint: "#4b5563",
    disabled: "#3f4854",
  },
  brand: {
    primary: "#16a34a",
  },
  status: {
    online: "#4ade80",
    positive: "#16a34a",
    negative: "#dc2626",
    neutral: "#9ca3af",
  },
  sensor: {
    temperature: "#f97316",
    humidity: "#0ea5e9",
    pressure: "#14b8a6",
    uv: "#a855f7",
    rain: "#06b6d4",
    wind: "#10b981",
  },
};

/** Nome da CSS var correspondente a `expectedColorTokens[category][key]`. */
export function cssVarName(category: string, key: string): string {
  return `--color-${category}-${key}`;
}

/** Nome da chave Tailwind correspondente (`colors[category][key]`) apontando para a var. */
export function tailwindVarValue(category: string, key: string): string {
  return `var(${cssVarName(category, key)})`;
}

/** fontFamily.sans esperado. */
export const expectedFontFamilySans = ["Inter", "sans-serif"];

/** boxShadow.frame esperado — única sombra real do design (container externo). */
export const expectedBoxShadowFrame = "0 24px 48px rgba(15, 23, 42, 0.3)";

/**
 * borderRadius.extend esperado — apenas valores observados em
 * docs/design-extraction.md §3.2 sem equivalente exato na escala default do
 * Tailwind 3 (que já cobre 4/8/12/16/9999px via rounded/lg/xl/2xl/full).
 */
export const expectedBorderRadiusExtend: Record<string, string> = {
  3: "3px",
  7: "7px",
  9: "9px",
  10: "10px",
  14: "14px",
};
