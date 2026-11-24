import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDayMonth, formatTime } from "../../src/utils/formatTime";

/**
 * `formatTime`/`formatDayMonth` (F6 T6.4 — design.md "Formatação": util
 * `formatTime(utc, tz)` UTC→local; spec.md edge case "fuso do usuário").
 * Usa `Date#getHours`/`getDate` (fuso LOCAL do processo), então o TZ do
 * processo é fixado em UTC para os asserts ficarem determinísticos
 * independente da máquina/CI que roda o teste — mesma estratégia já usada em
 * `test/components/ChartsSection.test.tsx`.
 */
let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

describe("formatTime", () => {
  it("formata um ISO UTC em HH:MM (fuso local)", () => {
    expect(formatTime("2026-07-23T14:30:00.000Z")).toBe("14:30");
  });

  it("preenche com zero à esquerda horas/minutos < 10", () => {
    expect(formatTime("2026-07-23T05:07:00.000Z")).toBe("05:07");
  });

  it("null/undefined (sem timestamp ainda) retorna placeholder, sem lançar", () => {
    expect(formatTime(null)).toBe("--:--");
    expect(formatTime(undefined)).toBe("--:--");
  });

  it("string inválida não lança nem produz 'NaN:NaN' — cai no placeholder", () => {
    expect(formatTime("não é uma data")).toBe("--:--");
  });
});

describe("formatDayMonth", () => {
  it("formata um ISO UTC em DD/MM (fuso local)", () => {
    expect(formatDayMonth("2026-07-01T00:00:00.000Z")).toBe("01/07");
    expect(formatDayMonth("2026-07-20T00:00:00.000Z")).toBe("20/07");
  });

  it("null/undefined retorna placeholder, sem lançar", () => {
    expect(formatDayMonth(null)).toBe("--/--");
    expect(formatDayMonth(undefined)).toBe("--/--");
  });

  it("string inválida não lança — cai no placeholder", () => {
    expect(formatDayMonth("não é uma data")).toBe("--/--");
  });
});
