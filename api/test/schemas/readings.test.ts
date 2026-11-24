import { describe, expect, it } from "vitest";
import { readings } from "../../src/db/schema.js";
import {
  METRIC_COLUMNS,
  metricSchema,
  rangeSchema,
  seriesQuerySchema,
} from "../../src/schemas/readings.js";

describe("metricSchema (T4.1 — READ-07)", () => {
  it.each(["temperature_c", "humidity_pct", "pressure_hpa", "rain_mm", "uv_index"])(
    "aceita '%s'",
    (metric) => {
      expect(metricSchema.safeParse(metric).success).toBe(true);
    },
  );

  it("rejeita métrica fora da whitelist", () => {
    expect(metricSchema.safeParse("station_id").success).toBe(false);
  });
});

describe("rangeSchema (T4.1 — READ-06)", () => {
  it.each(["24h", "7d", "30d"])("aceita '%s'", (range) => {
    expect(rangeSchema.safeParse(range).success).toBe(true);
  });

  it("rejeita range inválido", () => {
    expect(rangeSchema.safeParse("1y").success).toBe(false);
  });
});

describe("seriesQuerySchema (T4.1 — READ-07)", () => {
  it("aceita query válida", () => {
    const result = seriesQuerySchema.safeParse({ metric: "temperature_c", range: "24h" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ metric: "temperature_c", window: { range: "24h" } });
    }
  });

  it("rejeita metric inválida", () => {
    expect(seriesQuerySchema.safeParse({ metric: "nope", range: "24h" }).success).toBe(false);
  });

  it("rejeita range inválido", () => {
    expect(seriesQuerySchema.safeParse({ metric: "temperature_c", range: "nope" }).success).toBe(
      false,
    );
  });

  it("rejeita quando metric está ausente", () => {
    expect(seriesQuerySchema.safeParse({ range: "24h" }).success).toBe(false);
  });

  it("rejeita quando range e from/to estão ausentes", () => {
    expect(seriesQuerySchema.safeParse({ metric: "temperature_c" }).success).toBe(false);
  });

  it("aceita from/to e converte em janela de Date", () => {
    const result = seriesQuerySchema.safeParse({
      metric: "temperature_c",
      from: "2026-10-25T03:00:00.000Z",
      to: "2026-11-25T02:59:59.999Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.window).toEqual({
        from: new Date("2026-10-25T03:00:00.000Z"),
        to: new Date("2026-11-25T02:59:59.999Z"),
      });
    }
  });

  it("rejeita range junto com from/to", () => {
    expect(
      seriesQuerySchema.safeParse({
        metric: "temperature_c",
        range: "24h",
        from: "2026-10-25T03:00:00.000Z",
        to: "2026-11-25T02:59:59.999Z",
      }).success,
    ).toBe(false);
  });

  it.each([[{ from: "2026-10-25T03:00:00.000Z" }], [{ to: "2026-10-25T03:00:00.000Z" }]])(
    "rejeita from/to incompleto (%o)",
    (partial) => {
      expect(seriesQuerySchema.safeParse({ metric: "temperature_c", ...partial }).success).toBe(
        false,
      );
    },
  );

  it("rejeita from > to", () => {
    expect(
      seriesQuerySchema.safeParse({
        metric: "temperature_c",
        from: "2026-11-25T03:00:00.000Z",
        to: "2026-10-25T03:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("aceita 3 meses (92 dias de calendário, até o fim do último dia)", () => {
    expect(
      seriesQuerySchema.safeParse({
        metric: "temperature_c",
        from: "2026-08-25T03:00:00.000Z",
        to: "2026-11-25T02:59:59.999Z",
      }).success,
    ).toBe(true);
  });

  it("rejeita intervalo personalizado acima de 3 meses", () => {
    expect(
      seriesQuerySchema.safeParse({
        metric: "temperature_c",
        from: "2026-07-01T03:00:00.000Z",
        to: "2026-11-25T02:59:59.999Z",
      }).success,
    ).toBe(false);
  });

  it("rejeita intervalo maior que 366 dias", () => {
    expect(
      seriesQuerySchema.safeParse({
        metric: "temperature_c",
        from: "2024-01-01T00:00:00.000Z",
        to: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("METRIC_COLUMNS (T4.1 — whitelist metric→coluna)", () => {
  it("mapeia cada métrica para a coluna Drizzle correspondente", () => {
    expect(METRIC_COLUMNS.temperature_c).toBe(readings.temperatureC);
    expect(METRIC_COLUMNS.humidity_pct).toBe(readings.humidityPct);
    expect(METRIC_COLUMNS.pressure_hpa).toBe(readings.pressureHpa);
    expect(METRIC_COLUMNS.rain_mm).toBe(readings.rainMm);
    expect(METRIC_COLUMNS.uv_index).toBe(readings.uvIndex);
  });
});
