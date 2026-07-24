import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cssVarName,
  escapeRegExp,
  expectedColorTokens,
  expectedLightColorTokens,
  expectedShadowValuesDark,
  expectedShadowValuesLight,
  expectedShadowValuesToggle,
  shadowVarName,
} from "./fixtures/design-tokens";

const themeCssPath = resolve(__dirname, "../src/styles/theme.css");
const themeCss = readFileSync(themeCssPath, "utf-8");

// Isola o texto do bloco `[data-theme="light"] { ... }` pra checar overrides
// de light sem risco de "achar" um valor que na verdade só existe no :root
// (dark). Não há chaves aninhadas dentro do bloco (só declarações `--x: y;`),
// então parar no primeiro `}` fecha o bloco corretamente.
function extractLightBlock(css: string): string {
  const match = css.match(/\[data-theme="light"\]\s*\{([\s\S]*?)\}/);
  expect(match, 'bloco [data-theme="light"] não encontrado em theme.css').not.toBeNull();
  return match![1]!;
}

// `theme.css` é a fonte única dos valores de cor/sombra (AC DS-01: "quando um
// token muda, propaga via CSS vars/theme"; DS-07: toggle claro/escuro). Este
// teste lê o CSS bruto (sem pipeline de build) e confere, por regex, que cada
// var existe com o valor esperado — cross-referenciando os MESMOS tokens
// usados no teste de tailwind.config, para pegar drift entre os dois.
describe("src/styles/theme.css", () => {
  it("declara um bloco :root (tema escuro, default)", () => {
    expect(themeCss).toMatch(/:root\s*\{/);
  });

  it('declara um bloco [data-theme="light"] (mecanismo de troca de tema — DS-07)', () => {
    expect(themeCss).toMatch(/\[data-theme="light"\]\s*\{/);
  });

  describe("tema escuro (:root)", () => {
    for (const [category, tokens] of Object.entries(expectedColorTokens)) {
      for (const [key, value] of Object.entries(tokens)) {
        const varName = cssVarName(category, key);

        it(`define ${varName}: ${value}`, () => {
          const pattern = new RegExp(`${varName}\\s*:\\s*${escapeRegExp(value)}\\s*;`, "i");
          expect(themeCss).toMatch(pattern);
        });
      }
    }

    for (const [key, value] of Object.entries(expectedShadowValuesDark)) {
      const varName = shadowVarName(key);

      it(`define ${varName}: ${value}`, () => {
        const pattern = new RegExp(`${varName}\\s*:\\s*${escapeRegExp(value)}\\s*;`, "i");
        expect(themeCss).toMatch(pattern);
      });
    }
  });

  describe('tema claro ([data-theme="light"]) — overrides confirmados em §8', () => {
    const lightBlock = extractLightBlock(themeCss);

    for (const [category, tokens] of Object.entries(expectedLightColorTokens)) {
      for (const [key, value] of Object.entries(tokens)) {
        const varName = cssVarName(category, key);

        it(`sobrescreve ${varName}: ${value}`, () => {
          const pattern = new RegExp(`${varName}\\s*:\\s*${escapeRegExp(value)}\\s*;`, "i");
          expect(lightBlock).toMatch(pattern);
        });
      }
    }

    for (const [key, value] of Object.entries(expectedShadowValuesLight)) {
      const varName = shadowVarName(key);

      it(`sobrescreve ${varName}: ${value}`, () => {
        const pattern = new RegExp(`${varName}\\s*:\\s*${escapeRegExp(value)}\\s*;`, "i");
        expect(lightBlock).toMatch(pattern);
      });
    }
  });

  describe("toggle (invariante de tema — §8.7, só existe em :root)", () => {
    const lightBlock = extractLightBlock(themeCss);

    for (const [key, value] of Object.entries(expectedShadowValuesToggle)) {
      const varName = shadowVarName(key);

      it(`define ${varName}: ${value} em :root e NÃO o sobrescreve no light`, () => {
        const pattern = new RegExp(`${varName}\\s*:\\s*${escapeRegExp(value)}\\s*;`, "i");
        expect(themeCss).toMatch(pattern);
        expect(lightBlock).not.toMatch(new RegExp(`${varName}\\s*:`, "i"));
      });
    }

    it("toggle.track-off/track-on/knob não são sobrescritos no bloco light", () => {
      expect(lightBlock).not.toMatch(/--color-toggle-/i);
    });
  });

  it("surface.chip e text.disabled não são sobrescritos no light (sem hex documentado — ver comentários)", () => {
    const lightBlock = extractLightBlock(themeCss);
    expect(lightBlock).not.toMatch(/--color-surface-chip\s*:/i);
    expect(lightBlock).not.toMatch(/--color-text-disabled\s*:/i);
  });
});
