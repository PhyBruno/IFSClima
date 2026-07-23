import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cssVarName, expectedColorTokens } from "./fixtures/design-tokens";

const themeCssPath = resolve(__dirname, "../src/styles/theme.css");
const themeCss = readFileSync(themeCssPath, "utf-8");

// `theme.css` é a fonte única dos valores de cor (AC DS-01: "quando um token
// muda, propaga via CSS vars/theme"). Este teste lê o CSS bruto (sem pipeline
// de build) e confere, por regex, que cada var existe com o hex esperado —
// cross-referenciando os MESMOS tokens usados no teste de tailwind.config,
// para pegar drift entre os dois.
describe("src/styles/theme.css", () => {
  it("declara um bloco :root", () => {
    expect(themeCss).toMatch(/:root\s*\{/);
  });

  for (const [category, tokens] of Object.entries(expectedColorTokens)) {
    for (const [key, hex] of Object.entries(tokens)) {
      const varName = cssVarName(category, key);

      it(`define ${varName}: ${hex}`, () => {
        const pattern = new RegExp(`${varName}\\s*:\\s*${hex}\\s*;`, "i");
        expect(themeCss).toMatch(pattern);
      });
    }
  }
});
