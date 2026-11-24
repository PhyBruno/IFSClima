import { beforeAll, describe, expect, it } from "vitest";
import {
  buildSearchWithPeriod,
  getPeriodFromSearch,
  periodLabel,
  periodToWindow,
} from "../../src/utils/period";

let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
  return () => {
    process.env.TZ = originalTZ;
  };
});

const FROM = "2026-10-25T00:00:00.000Z";
const TO = "2026-11-24T23:59:59.999Z";

describe("getPeriodFromSearch", () => {
  it("default 24h sem ?range=", () => {
    expect(getPeriodFromSearch("")).toEqual({ range: "24h" });
  });

  it("lê os presets", () => {
    expect(getPeriodFromSearch("?range=7d")).toEqual({ range: "7d" });
    expect(getPeriodFromSearch("?range=30d")).toEqual({ range: "30d" });
  });

  it("lê o personalizado com from/to", () => {
    expect(getPeriodFromSearch(`?range=custom&from=${FROM}&to=${TO}`)).toEqual({
      range: "custom",
      from: FROM,
      to: TO,
    });
  });

  it.each([
    ["?range=1y"],
    ["?range=custom"],
    [`?range=custom&from=${FROM}`],
    [`?range=custom&from=nope&to=${TO}`],
    [`?range=custom&from=${TO}&to=${FROM}`],
    ["?range=custom&from=2026-01-01T00:00:00.000Z&to=2026-11-24T23:59:59.999Z"],
  ])("valor inválido/incompleto/acima de 3 meses (%s) cai no default 24h", (search) => {
    expect(getPeriodFromSearch(search)).toEqual({ range: "24h" });
  });
});

describe("buildSearchWithPeriod", () => {
  it("preset: seta range e remove from/to, preservando os demais parâmetros", () => {
    expect(
      buildSearchWithPeriod(`?foo=1&range=custom&from=${FROM}&to=${TO}`, { range: "7d" }),
    ).toBe("?foo=1&range=7d");
  });

  it("personalizado: grava range=custom com from/to (e volta pela leitura)", () => {
    const search = buildSearchWithPeriod("", { range: "custom", from: FROM, to: TO });
    expect(getPeriodFromSearch(search)).toEqual({ range: "custom", from: FROM, to: TO });
  });
});

describe("periodToWindow / periodLabel", () => {
  it("preset vira {range}; personalizado vira {from, to}", () => {
    expect(periodToWindow({ range: "30d" })).toEqual({ range: "30d" });
    expect(periodToWindow({ range: "custom", from: FROM, to: TO })).toEqual({ from: FROM, to: TO });
  });

  it("rótulos curtos (painel) e longos (relatório)", () => {
    expect(periodLabel({ range: "24h" })).toBe("Últimas 24h");
    expect(periodLabel({ range: "24h" }, "long")).toBe("Últimas 24 horas");
    expect(periodLabel({ range: "custom", from: FROM, to: TO })).toBe("25/10 – 24/11");
    expect(periodLabel({ range: "custom", from: FROM, to: TO }, "long")).toBe(
      "25/10/2026 – 24/11/2026",
    );
  });
});
