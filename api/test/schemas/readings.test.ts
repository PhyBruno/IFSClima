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
      expect(result.data).toEqual({ metric: "temperature_c", range: "24h" });
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

  it("rejeita quando range está ausente", () => {
    expect(seriesQuerySchema.safeParse({ metric: "temperature_c" }).success).toBe(false);
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
