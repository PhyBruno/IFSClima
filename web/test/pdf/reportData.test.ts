import { describe, expect, it } from "vitest";
import {
  downsample,
  fileDateStamp,
  formatDateTime,
  formatMetricValue,
  formatNumber,
  getMetricMeta,
  paginate,
  readingsToPoints,
  seriesToPoints,
  summarizeReadings,
  summarizeSeries,
} from "../../src/pdf/reportData";
import { historyFixture, rainSeriesFixture, seriesFixture } from "../fixtures/readings";

describe("reportData", () => {
  describe("summarizeSeries", () => {
    it("mín/máx vêm dos extremos reais dos buckets; média é a média das médias", () => {
      const summary = summarizeSeries(seriesFixture);

      expect(summary.min).toBe(23.6);
      expect(summary.max).toBe(25.1);
      expect(summary.avg).toBeCloseTo(24.4, 5);
      expect(summary.count).toBe(2);
    });

    it("chuva usa o `sum` de cada bucket e soma o total do período", () => {
      const summary = summarizeSeries(rainSeriesFixture);

      expect(summary.total).toBeCloseTo(0.5, 5);
      expect(summary.min).toBe(0.1);
      expect(summary.max).toBe(0.4);
    });

    it("série ausente, vazia ou só com nulos devolve resumo vazio", () => {
      const empty = { min: null, avg: null, max: null, total: null, count: 0 };
      expect(summarizeSeries(undefined)).toEqual(empty);
      expect(summarizeSeries({ ...seriesFixture, buckets: [] })).toEqual(empty);
      expect(
        summarizeSeries({
          ...seriesFixture,
          buckets: [{ t: "2026-07-23T13:00:00.000Z", avg: null, min: null, max: null, sum: null }],
        }),
      ).toEqual(empty);
    });

    it("sem min/max nos buckets, cai nos extremos das médias", () => {
      const summary = summarizeSeries({
        ...seriesFixture,
        buckets: [
          { t: "2026-07-23T13:00:00.000Z", avg: 10, min: null, max: null, sum: null },
          { t: "2026-07-23T14:00:00.000Z", avg: 20, min: null, max: null, sum: null },
        ],
      });

      expect(summary.min).toBe(10);
      expect(summary.max).toBe(20);
    });
  });

  it("summarizeReadings ignora nulos", () => {
    const summary = summarizeReadings(historyFixture.readings, "uv_index");

    expect(summary).toEqual({ min: 5.3, max: 5.3, avg: 5.3, total: 5.3, count: 1 });
  });

  it("seriesToPoints usa avg nas métricas comuns e sum na chuva", () => {
    expect(seriesToPoints(seriesFixture).map((p) => p.v)).toEqual([24.1, 24.7]);
    expect(seriesToPoints(rainSeriesFixture).map((p) => p.v)).toEqual([0.4, 0.1]);
    expect(seriesToPoints(undefined)).toEqual([]);
  });

  it("readingsToPoints ordena cronologicamente (a API devolve desc)", () => {
    const points = readingsToPoints(historyFixture.readings, "temperature_c");

    expect(points.map((p) => p.v)).toEqual([24.5, 24.7]);
    expect(points[0]!.t).toBeLessThan(points[1]!.t);
  });

  describe("downsample", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ t: i, v: i as number | null }));

    it("não mexe quando já cabe", () => {
      expect(downsample(points, 20)).toBe(points);
    });

    it("agrupa em média (default) ou soma", () => {
      expect(downsample(points, 5).map((p) => p.v)).toEqual([0.5, 2.5, 4.5, 6.5, 8.5]);
      expect(downsample(points, 5, "sum").map((p) => p.v)).toEqual([1, 5, 9, 13, 17]);
    });

    it("grupo só com nulos vira null (buraco no traço)", () => {
      const withGap = [
        { t: 0, v: null },
        { t: 1, v: null },
        { t: 2, v: 4 },
        { t: 3, v: 6 },
      ];
      expect(downsample(withGap, 2).map((p) => p.v)).toEqual([null, 5]);
    });
  });

  it("paginate: primeira página com tamanho próprio e sempre ao menos uma página", () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginate([], 3, 3)).toEqual([[]]);
  });

  describe("formatação", () => {
    it("formatNumber usa vírgula decimal e travessão para ausente", () => {
      expect(formatNumber(24.66, 1)).toBe("24,7");
      expect(formatNumber(1013, 1)).toBe("1.013,0");
      expect(formatNumber(null, 1)).toBe("—");
    });

    it("formatMetricValue junta a unidade (UV não tem unidade)", () => {
      expect(formatMetricValue(24.7, getMetricMeta("temperature_c"))).toBe("24,7 °C");
      expect(formatMetricValue(5.3, getMetricMeta("uv_index"))).toBe("5,3");
      expect(formatMetricValue(null, getMetricMeta("rain_mm"))).toBe("—");
    });

    it("formatDateTime em DD/MM/AAAA HH:MM no fuso local (suíte em UTC)", () => {
      expect(formatDateTime("2026-07-23T14:30:00.000Z")).toBe("23/07/2026 14:30");
      expect(formatDateTime(new Date("2026-01-02T03:04:00.000Z"))).toBe("02/01/2026 03:04");
      expect(formatDateTime(null)).toBe("—");
      expect(formatDateTime("inválido")).toBe("—");
    });

    it("fileDateStamp em AAAA-MM-DD", () => {
      expect(fileDateStamp(new Date("2026-09-29T12:00:00.000Z"))).toBe("2026-09-29");
    });
  });
});
