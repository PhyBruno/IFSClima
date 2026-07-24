/**
 * Fonte compartilhada dos tokens de cor/sombra esperados (T5.2 dark, T5.2b
 * light), usada tanto pelo teste de `tailwind.config.js` quanto pelo teste
 * de `src/styles/theme.css`, para pegar drift entre os dois sem duplicar
 * hex "soltos" em cada arquivo.
 *
 * Valores conferidos contra `docs/design-extraction.md` (§1-7 dark, §8 light).
 */

/** Categoria -> chave -> hex/valor esperado no tema ESCURO (`:root`). */
export const expectedColorTokens: Record<string, Record<string, string>> = {
  surface: {
    page: "#0d1117",
    sidebar: "#12161d",
    card: "#161b22",
    chip: "#1c2129",
    // Sem nome no dark original — reaproveitam surface.card/sidebar, ver
    // comentário em theme.css (§5.4 e §5.6 respectivamente).
    "status-panel": "#161b22",
    "table-header": "#12161d",
  },
  border: {
    default: "#262c35",
    subtle: "#1e232b",
    dashed: "#2a313c",
    // Dark usa a mesma border.default pro frame — ver §8.2.
    frame: "#262c35",
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
    // Dark não distingue dot de texto (§1.5) — mesmo valor pros dois.
    "online-dot": "#4ade80",
    "online-text": "#4ade80",
    positive: "#16a34a",
    negative: "#dc2626",
    neutral: "#9ca3af",
  },
  nav: {
    "active-bg": "rgba(22, 163, 74, 0.16)",
    "active-text": "#4ade80",
  },
  toggle: {
    // Invariantes de tema (mesma justificativa em theme.css) — só existem
    // em :root, por isso também aparecem aqui e NÃO em expectedLightColorTokens.
    "track-off": "#e6e8eb",
    "track-on": "#16a34a",
    knob: "#ffffff",
  },
  sensor: {
    temperature: "#f97316",
    humidity: "#0ea5e9",
    pressure: "#14b8a6",
    uv: "#a855f7",
    rain: "#06b6d4",
    wind: "#10b981",
    // Fundo do chip de ícone (feedback do usuário, 2026-07-24): no dark
    // aponta pro chip neutro via var() — não duplica o hex, ver theme.css.
    "temperature-bg": "var(--color-surface-chip)",
    "humidity-bg": "var(--color-surface-chip)",
    "pressure-bg": "var(--color-surface-chip)",
    "uv-bg": "var(--color-surface-chip)",
    "rain-bg": "var(--color-surface-chip)",
    "wind-bg": "var(--color-surface-chip)",
  },
};

/**
 * Categoria -> chave -> hex/valor esperado no tema CLARO
 * (`[data-theme="light"]`). Só inclui as chaves que a extração (§8) confirma
 * terem um override real — categorias/chaves ausentes aqui herdam do `:root`
 * de propósito (ver comentários em theme.css: surface.chip, text.disabled,
 * brand.*, status.positive/negative/neutral, sensor.*, toggle.*).
 */
export const expectedLightColorTokens: Record<string, Record<string, string>> = {
  surface: {
    page: "#f7f8f9",
    sidebar: "#ffffff",
    card: "#ffffff",
    "status-panel": "#f7f8f9",
    "table-header": "#fafbfb",
  },
  border: {
    default: "#e6e8eb",
    subtle: "#f0f1f2",
    dashed: "#d8dade",
    frame: "#e2e4e7",
  },
  text: {
    primary: "#111827",
    secondary: "#374151",
    tertiary: "#6b7280",
    muted: "#9ca3af",
    faint: "#c1c5cb",
  },
  status: {
    "online-dot": "#22c55e",
    "online-text": "#16a34a",
  },
  nav: {
    "active-bg": "#ecfdf5",
    "active-text": "#16a34a",
  },
  sensor: {
    // Pastel por sensor pro fundo do chip de ícone — §8.4 ("bg claro
    // associado"), feedback do usuário 2026-07-24.
    "temperature-bg": "#fff7ed",
    "humidity-bg": "#f0f9ff",
    "pressure-bg": "#f0fdfa",
    "uv-bg": "#faf5ff",
    "rain-bg": "#ecfeff",
    "wind-bg": "#ecfdf5",
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

/**
 * boxShadow.* esperado em `theme.extend.boxShadow` — todos apontam pra CSS
 * vars (T5.2b: precisam variar por tema, então pararam de ser valor
 * hardcoded como `frame` era em T5.2).
 */
export const expectedBoxShadowVars: Record<string, string> = {
  frame: "var(--shadow-frame)",
  card: "var(--shadow-card)",
  "toggle-off": "var(--shadow-toggle-off)",
  "toggle-on": "var(--shadow-toggle-on)",
};

/** Nome da CSS var de sombra correspondente a uma chave de `expectedBoxShadowVars`. */
export function shadowVarName(key: string): string {
  return `--shadow-${key}`;
}

/** Valores reais das CSS vars de sombra — dark (`:root`) e light (override). */
export const expectedShadowValuesDark: Record<string, string> = {
  frame: "0 24px 48px rgba(15, 23, 42, 0.3)",
  // Nenhum card interno tem sombra no dark (§3.3) — "none" é o valor real.
  card: "none",
};

export const expectedShadowValuesLight: Record<string, string> = {
  // Valor desktop (§8.8); variação mobile (alpha 0.18) não vira var nova —
  // ver comentário em theme.css.
  frame: "0 24px 48px rgba(15, 23, 42, 0.14)",
  card: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

/**
 * Sombras do knob do toggle — invariantes de tema (§8.7), só existem em
 * `:root`, sem override em `[data-theme="light"]` (mesma lógica de
 * toggle.track-off/on em `expectedColorTokens`).
 */
export const expectedShadowValuesToggle: Record<string, string> = {
  "toggle-off": "0 1px 2px rgba(0, 0, 0, 0.15)",
  "toggle-on": "0 1px 2px rgba(0, 0, 0, 0.3)",
};

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

/**
 * Escapa caracteres especiais de regex — necessário porque, a partir de
 * T5.2b, alguns valores esperados não são hex simples (ex.: `rgba(22, 163,
 * 74, 0.16)` de nav.active-bg no dark, ou os box-shadow compostos), que têm
 * parênteses/pontos/vírgulas com significado especial em regex.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
