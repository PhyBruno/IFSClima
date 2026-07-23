/**
 * Tema Tailwind — mapeia classes utilitárias semânticas para as CSS vars
 * definidas em `src/styles/theme.css` (fonte única dos valores de cor).
 * Mudar um valor de cor deve acontecer em `theme.css`, nunca aqui.
 *
 * Tokens extraídos por render real do design original — ver
 * `docs/design-extraction.md` (T5.1) e `.specs/features/f5-design-system/spec.md` (DS-01).
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
        },
        border: {
          DEFAULT: "var(--color-border-default)",
          default: "var(--color-border-default)",
          subtle: "var(--color-border-subtle)",
          dashed: "var(--color-border-dashed)",
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
          online: "var(--color-status-online)",
          positive: "var(--color-status-positive)",
          negative: "var(--color-status-negative)",
          neutral: "var(--color-status-neutral)",
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
        // Sombra do container externo ("janela" do app) — a ÚNICA sombra real
        // observada no design; cards internos são flat (docs/design-extraction.md §3.3).
        frame: "0 24px 48px rgba(15, 23, 42, 0.3)",
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
