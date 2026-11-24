import { describe, expect, it } from "vitest";
import { formatDecimal, formatFixed } from "../../src/utils/formatNumber";

describe("formatDecimal / formatFixed (pt-BR, sem separador de milhar)", () => {
  it("vírgula decimal e sem milhar — convenção meteorológica (1011,3 hPa)", () => {
    expect(formatDecimal(1011.34)).toBe("1011,3");
    expect(formatFixed(1011.34, 1)).toBe("1011,3");
  });

  it("formatDecimal omite zeros à direita; formatFixed mantém as casas", () => {
    expect(formatDecimal(24)).toBe("24");
    expect(formatFixed(24, 1)).toBe("24,0");
    expect(formatFixed(61.6, 0)).toBe("62");
  });

  it("-0 arredondado vira '0', nunca '-0'", () => {
    expect(formatDecimal(-0.04)).toBe("0");
    expect(formatFixed(-0.04, 1)).toBe("0,0");
  });
});
