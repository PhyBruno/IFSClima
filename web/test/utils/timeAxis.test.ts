import { beforeAll, describe, expect, it } from "vitest";
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  bucketCenter,
  dayBoundaries,
  formatPointTime,
  formatTick,
  insertGaps,
  maxGapFor,
  timeTicks,
  usesRawDots,
} from "../../src/utils/timeAxis";

let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
  return () => {
    process.env.TZ = originalTZ;
  };
});

const MIDNIGHT = Date.UTC(2026, 10, 1);

describe("dayBoundaries (divisores de dia — pedido do usuário, 2026-11-24)", () => {
  it("até 2 dias: nenhum divisor", () => {
    expect(dayBoundaries(MIDNIGHT + 14 * MS_PER_HOUR, MIDNIGHT + 38 * MS_PER_HOUR)).toEqual([]);
    expect(dayBoundaries(MIDNIGHT, MIDNIGHT + 2 * MS_PER_DAY)).toEqual([]);
  });

  it("3 dias começando às 14h: uma linha em cada meia-noite DENTRO do intervalo", () => {
    const from = MIDNIGHT + 14 * MS_PER_HOUR;
    expect(dayBoundaries(from, from + 3 * MS_PER_DAY)).toEqual([
      MIDNIGHT + MS_PER_DAY,
      MIDNIGHT + 2 * MS_PER_DAY,
      MIDNIGHT + 3 * MS_PER_DAY,
    ]);
  });

  it("30 dias a partir da meia-noite: 29 divisores (as bordas não contam)", () => {
    expect(dayBoundaries(MIDNIGHT, MIDNIGHT + 30 * MS_PER_DAY)).toHaveLength(29);
  });
});

describe("timeTicks", () => {
  it("24h: horas cheias, no máximo 5", () => {
    const from = MIDNIGHT + 14 * MS_PER_HOUR + 20 * 60_000;
    const ticks = timeTicks(from, from + MS_PER_DAY);
    expect(ticks.length).toBeLessThanOrEqual(5);
    ticks.forEach((tick) => {
      expect(tick % MS_PER_HOUR).toBe(0);
      expect(tick).toBeGreaterThanOrEqual(from);
    });
  });

  it("30 dias: meias-noites, no máximo 5", () => {
    const ticks = timeTicks(MIDNIGHT + 5 * MS_PER_HOUR, MIDNIGHT + 30 * MS_PER_DAY);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks.length).toBeGreaterThan(1);
    ticks.forEach((tick) => expect(tick % MS_PER_DAY).toBe(0));
  });

  it("intervalo degenerado: o próprio instante", () => {
    expect(timeTicks(MIDNIGHT, MIDNIGHT)).toEqual([MIDNIGHT]);
  });
});

describe("formatTick / formatPointTime", () => {
  it("formatTick: hora até 36 h, dia acima", () => {
    const t = MIDNIGHT + 14 * MS_PER_HOUR;
    expect(formatTick(t, MS_PER_DAY)).toBe("14:00");
    expect(formatTick(t, 7 * MS_PER_DAY)).toBe("01/11");
  });

  it("formatPointTime: dia para bucket diário, dia+hora para os demais", () => {
    const t = MIDNIGHT + 14 * MS_PER_HOUR + 7 * 60_000;
    expect(formatPointTime(t, "day")).toBe("01/11");
    expect(formatPointTime(t, "hour")).toBe("01/11 14:07");
    expect(formatPointTime(t, "raw")).toBe("01/11 14:07");
  });
});

describe("bucketCenter", () => {
  it("hora: meio da hora; dia: meio-dia; leitura bruta: o próprio instante", () => {
    expect(bucketCenter(MIDNIGHT, "hour")).toBe(MIDNIGHT + MS_PER_HOUR / 2);
    expect(bucketCenter(MIDNIGHT, "day")).toBe(MIDNIGHT + MS_PER_DAY / 2);
    expect(bucketCenter(MIDNIGHT, "raw")).toBe(MIDNIGHT);
  });

  it("limita à janela (o último bucket pode ser parcial)", () => {
    expect(bucketCenter(MIDNIGHT, "day", [MIDNIGHT, MIDNIGHT + MS_PER_HOUR])).toBe(
      MIDNIGHT + MS_PER_HOUR,
    );
  });
});

describe("insertGaps / maxGapFor", () => {
  it("insere um null entre pontos separados por mais que o limite", () => {
    const points = [
      { t: 0, v: 1 },
      { t: 10, v: 2 },
      { t: 100, v: 3 },
    ];
    expect(insertGaps(points, 20)).toEqual([
      { t: 0, v: 1 },
      { t: 10, v: 2 },
      { t: 55, v: null },
      { t: 100, v: 3 },
    ]);
  });

  it("limite: 1,5 bucket nos agregados, 1 h nas leituras brutas", () => {
    expect(maxGapFor("hour")).toBe(1.5 * MS_PER_HOUR);
    expect(maxGapFor("day")).toBe(1.5 * MS_PER_DAY);
    expect(maxGapFor("raw")).toBe(MS_PER_HOUR);
  });
});

describe("usesRawDots (pontos brutos só até 1 dia — pedido do usuário, 2026-11-24)", () => {
  const iso = (t: number) => new Date(t).toISOString();

  it("24 h (e um dia personalizado) → leituras brutas", () => {
    expect(usesRawDots(iso(MIDNIGHT), iso(MIDNIGHT + MS_PER_DAY))).toBe(true);
    expect(usesRawDots(iso(MIDNIGHT), iso(MIDNIGHT + MS_PER_DAY - 1))).toBe(true);
  });

  it("acima de 1 dia (2 dias, 7d, 30d) → médias por hora/dia", () => {
    expect(usesRawDots(iso(MIDNIGHT), iso(MIDNIGHT + 2 * MS_PER_DAY - 1))).toBe(false);
    expect(usesRawDots(iso(MIDNIGHT), iso(MIDNIGHT + 7 * MS_PER_DAY))).toBe(false);
  });

  it("sem janela ou janela inválida → false", () => {
    expect(usesRawDots(undefined, iso(MIDNIGHT))).toBe(false);
    expect(usesRawDots(iso(MIDNIGHT), undefined)).toBe(false);
    expect(usesRawDots("x", "y")).toBe(false);
  });
});
