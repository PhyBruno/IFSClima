/**
 * Tema Tailwind — mapeia classes utilitárias semânticas para as CSS vars
 * definidas em `src/styles/theme.css` (fonte única dos valores de cor/sombra).
 * Mudar um valor de cor deve acontecer em `theme.css`, nunca aqui.
 *
 * Tokens extraídos por render real do design original — ver
 * `docs/design-extraction.md` (T5.1 dark, T5.1b light) e
 * `.specs/features/f5-design-system/spec.md` (DS-01, DS-07).
 *
 * Tema claro (T5.2b): as MESMAS chaves abaixo resolvem pra valores diferentes
 * conforme o atributo `data-theme` no elemento raiz — ver bloco
 * `[data-theme="light"]` em `src/styles/theme.css`. Nada muda aqui por causa
 * do tema claro, só as vars que essas chaves apontam.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          page: "var(--color-surface-page)",
          sidebar: "var(--color-surface-sidebar)",
          card: "var(--color-surface-card)",
          chip: "var(--color-surface-chip)",
          "status-panel": "var(--color-surface-status-panel)",
          "table-header": "var(--color-surface-table-header)",
        },
        border: {
          DEFAULT: "var(--color-border-default)",
          default: "var(--color-border-default)",
          subtle: "var(--color-border-subtle)",
          dashed: "var(--color-border-dashed)",
          frame: "var(--color-border-frame)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
          muted: "var(--color-text-muted)",
          faint: "var(--color-text-faint)",
          disabled: "var(--color-text-disabled)",
        },
        brand: {
          primary: "var(--color-brand-primary)",
        },
        status: {
          // "online" era um único token em T5.2 (dark não distinguia dot de
          // texto); T5.2b separa em dot/text porque o light distingue de
          // verdade (§8.5) — o dark aponta as duas chaves pro mesmo valor.
          "online-dot": "var(--color-status-online-dot)",
          "online-text": "var(--color-status-online-text)",
          positive: "var(--color-status-positive)",
          negative: "var(--color-status-negative)",
          neutral: "var(--color-status-neutral)",
        },
        nav: {
          "active-bg": "var(--color-nav-active-bg)",
          "active-text": "var(--color-nav-active-text)",
        },
        toggle: {
          "track-off": "var(--color-toggle-track-off)",
          "track-on": "var(--color-toggle-track-on)",
          knob: "var(--color-toggle-knob)",
        },
        sensor: {
          temperature: "var(--color-sensor-temperature)",
          humidity: "var(--color-sensor-humidity)",
          pressure: "var(--color-sensor-pressure)",
          uv: "var(--color-sensor-uv)",
          rain: "var(--color-sensor-rain)",
          wind: "var(--color-sensor-wind)",
        },
      },
      fontFamily: {
        // Inter self-hosted via @fontsource (ver src/index.css). Fallback
        // sans-serif confirmado pelo render original (docs/design-extraction.md §2).
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        // Todas as sombras agora apontam pra CSS vars (T5.2 tinha `frame`
        // hardcoded, mas T5.2b precisa variar por tema — dark vs light — e
        // isso só é possível via var, igual ao padrão já usado em `colors`).
        frame: "var(--shadow-frame)",
        // shadow.card: no dark vale "none" (cards são flat, §3.3); no light
        // é a sombra sutil de StatCard/date-range-picker (§8.8).
        card: "var(--shadow-card)",
        // Sombra do knob do toggle "Modo escuro" nos dois estados — §8.7.
        // Invariante de tema (ver comentário em theme.css), só varia com
        // on/off do próprio switch.
        "toggle-off": "var(--shadow-toggle-off)",
        "toggle-on": "var(--shadow-toggle-on)",
      },
      borderRadius: {
        // Valores observados (docs/design-extraction.md §3.2) sem equivalente
        // exato na escala default do Tailwind 3 (que já cobre 4/8/12/16/9999
        // via rounded/lg/xl/2xl/full). Chaves numéricas -> rounded-3, rounded-7, etc.
        3: "3px",
        7: "7px",
        9: "9px",
        10: "10px",
        14: "14px",
      },
    },
  },
  plugins: [],
};
