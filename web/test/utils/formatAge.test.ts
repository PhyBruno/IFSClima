import { describe, expect, it } from "vitest";
import { formatAge } from "../../src/utils/formatAge";

/**
 * `formatAge` — texto relativo amigável a partir de `age_seconds` (F6 T6.2,
 * UI-03/AC3: "atualizado há X", ex. "há 2 min"). Fixtures sintéticas, sem
 * relação com dados reais da estação.
 */
describe("formatAge", () => {
  it("null (nenhuma leitura) retorna texto neutro, sem quebrar/NaN", () => {
    expect(formatAge(null)).toBe("sem leitura");
  });

  it("menos de 60s retorna 'agora mesmo'", () => {
    expect(formatAge(0)).toBe("agora mesmo");
    expect(formatAge(42)).toBe("agora mesmo");
    expect(formatAge(59)).toBe("agora mesmo");
  });

  it("minutos: arredonda e usa 'há N min'", () => {
    expect(formatAge(60)).toBe("há 1 min");
    expect(formatAge(120)).toBe("há 2 min");
    expect(formatAge(59 * 60)).toBe("há 59 min");
  });

  it("horas: 'há N h' a partir de 60 min", () => {
    expect(formatAge(60 * 60)).toBe("há 1h");
    expect(formatAge(3 * 60 * 60)).toBe("há 3h");
    expect(formatAge(23 * 60 * 60)).toBe("há 23h");
  });

  it("dias: 'há N d' a partir de 24h", () => {
    expect(formatAge(24 * 60 * 60)).toBe("há 1d");
    expect(formatAge(5 * 24 * 60 * 60)).toBe("há 5d");
  });

  it("valores negativos (relógio dessincronizado) não quebram — trata como 'agora mesmo'", () => {
    expect(formatAge(-5)).toBe("agora mesmo");
  });
});
