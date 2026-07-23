import { describe, expect, it } from "vitest";
import tailwindConfig from "../tailwind.config.js";
import {
  expectedBorderRadiusExtend,
  expectedBoxShadowFrame,
  expectedColorTokens,
  expectedFontFamilySans,
  tailwindVarValue,
} from "./fixtures/design-tokens";

// Forma mínima que este teste precisa do config — evitamos depender do tipo
// oficial `import('tailwindcss').Config` (bem permissivo/opcional) só para
// não brigar com `noUncheckedIndexedAccess`; o shape real é verificado pelos
// asserts abaixo, não pelo cast em si.
interface ExpectedTailwindConfig {
  theme: {
    extend: {
      colors: Record<string, Record<string, string>>;
      fontFamily: { sans: string[] };
      boxShadow: { frame: string };
      borderRadius: Record<string, string>;
    };
  };
}

// `tailwind.config.js` só é consultado pelo build do PostCSS/Tailwind (não
// gera CSS dentro do jsdom do Vitest) — este teste garante que o objeto de
// config em si não sofre regressão de valores, servindo de snapshot vivo dos
// tokens extraídos em T5.1.
describe("tailwind.config.js — theme.extend", () => {
  const { theme } = tailwindConfig as unknown as ExpectedTailwindConfig;
  const { colors, fontFamily, boxShadow, borderRadius } = theme.extend;

  it("mapeia cada token de cor esperado para a CSS var correspondente", () => {
    for (const [category, tokens] of Object.entries(expectedColorTokens)) {
      const categoryColors = colors[category];
      expect(categoryColors, `categoria "${category}" ausente em theme.extend.colors`).toBeDefined();

      for (const key of Object.keys(tokens)) {
        expect(categoryColors![key]).toBe(tailwindVarValue(category, key));
      }
    }
  });

  it("border.DEFAULT aponta para a mesma var que border.default (para a classe utilitária `border`)", () => {
    expect(colors.border!.DEFAULT).toBe(tailwindVarValue("border", "default"));
  });

  it("não introduz categorias/tokens de cor além dos esperados", () => {
    expect(Object.keys(colors).sort()).toEqual(Object.keys(expectedColorTokens).sort());

    for (const [category, tokens] of Object.entries(expectedColorTokens)) {
      const actualKeys = Object.keys(colors[category]!).filter((k) => k !== "DEFAULT");
      expect(actualKeys.sort()).toEqual(Object.keys(tokens).sort());
    }
  });

  it("fontFamily.sans é Inter com fallback sans-serif", () => {
    expect(fontFamily.sans).toEqual(expectedFontFamilySans);
  });

  it("boxShadow.frame é a única sombra real do design (container externo)", () => {
    expect(boxShadow.frame).toBe(expectedBoxShadowFrame);
  });

  it("borderRadius estende apenas os valores sem equivalente na escala default do Tailwind", () => {
    expect(borderRadius).toEqual(expectedBorderRadiusExtend);
  });
});
