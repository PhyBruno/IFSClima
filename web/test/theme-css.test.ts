import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// O jsdom não processa o Tailwind, então a cor computada não é testável aqui.
// Este teste pega drift no `src/index.css`: todo token que os componentes
// usam precisa existir nos DOIS temas (`:root` claro e `.dark`), senão uma
// classe como `bg-card` ou `text-destructive` resolve pra nada num deles.
const css = readFileSync(resolve(__dirname, "../src/index.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `bloco ${selector} ausente`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

const SHADCN_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "primary",
  "primary-foreground",
  "muted",
  "muted-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-accent",
];

describe("src/index.css — tema shadcn/ui", () => {
  it.each(SHADCN_TOKENS)("define --%s no tema claro e no escuro", (token) => {
    expect(block(":root")).toContain(`--${token}:`);
    expect(block(".dark")).toContain(`--${token}:`);
  });

  it("define os acentos por sensor e a escala OMS do UV no :root (herdados pelo .dark)", () => {
    const root = block(":root");
    for (const sensor of ["temperature", "humidity", "pressure", "uv", "rain", "wind"]) {
      expect(root).toContain(`--sensor-${sensor}:`);
    }
    for (const level of ["low", "moderate", "high", "very-high", "extreme"]) {
      expect(root).toContain(`--uv-${level}:`);
    }
  });

  it("aponta a paleta dos gráficos (--chart-1..5) para os sensores nos dois temas", () => {
    for (const selector of [":root", ".dark"]) {
      expect(block(selector)).toContain("--chart-1: var(--sensor-temperature);");
    }
  });

  it("expõe os tokens de domínio como utilitários do Tailwind (@theme inline)", () => {
    expect(css).toContain("--color-sensor-temperature: var(--sensor-temperature);");
    expect(css).toContain("--color-success: var(--success);");
    expect(css).toContain("--color-uv-extreme: var(--uv-extreme);");
  });

  it("usa a classe .dark como variante de tema escuro (convenção do shadcn)", () => {
    expect(css).toContain("@custom-variant dark (&:is(.dark *));");
  });
});
