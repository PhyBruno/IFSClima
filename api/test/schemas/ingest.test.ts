import { describe, expect, it } from "vitest";
import { MAX_BATCH, ingestRequestSchema, readingSchema } from "../../src/schemas/ingest.js";

const validReading = {
  timestamp: "2026-07-23T14:30:00.000Z",
  temperature_c: 24.7,
  humidity_pct: 61.2,
  pressure_hpa: 1013.4,
  rain_mm: 0.4,
  uv_index: 5.3,
  uv_voltage_v: 0.632,
};

describe("readingSchema — uv_voltage_v (tensao bruta do sensor UV)", () => {
  it("preserva a tensao bruta em vez de descartá-la", () => {
    const result = readingSchema.safeParse(validReading);

    expect(result.success).toBe(true);
    expect(result.success && result.data.uv_voltage_v).toBe(0.632);
  });

  it("aceita a leitura sem a tensao bruta (estacao antiga, ou sem sensor UV)", () => {
    const semTensao: Record<string, unknown> = { ...validReading };
    delete semTensao.uv_voltage_v;

    expect(readingSchema.safeParse(semTensao).success).toBe(true);
  });

  it("rejeita tensao com tipo errado", () => {
    const result = readingSchema.safeParse({ ...validReading, uv_voltage_v: "0.632" });

    expect(result.success).toBe(false);
  });
});

describe("readingSchema (T3.1 — ING-06)", () => {
  it("aceita uma leitura válida com todos os sensores presentes", () => {
    const result = readingSchema.safeParse(validReading);

    expect(result.success).toBe(true);
  });

  it("aceita campos de sensor ausentes/nulos (sensor pode falhar)", () => {
    const result = readingSchema.safeParse({
      timestamp: "2026-07-23T14:30:00.000Z",
      temperature_c: null,
    });

    expect(result.success).toBe(true);
  });

  it("rejeita quando timestamp não é uma string ISO 8601 válida", () => {
    const result = readingSchema.safeParse({ ...validReading, timestamp: "23/07/2026" });

    expect(result.success).toBe(false);
  });

  it("rejeita quando timestamp está ausente", () => {
    const withoutTimestamp: Record<string, unknown> = { ...validReading };
    delete withoutTimestamp.timestamp;
    const result = readingSchema.safeParse(withoutTimestamp);

    expect(result.success).toBe(false);
  });

  it("rejeita quando um campo de sensor tem tipo errado (string em vez de number)", () => {
    const result = readingSchema.safeParse({ ...validReading, temperature_c: "quente" });

    expect(result.success).toBe(false);
  });
});

describe("ingestRequestSchema (T3.1 — ING-06, ING-08)", () => {
  it("aceita payload válido com station_id explícito", () => {
    const result = ingestRequestSchema.safeParse({
      station_id: "main",
      readings: [validReading],
    });

    expect(result.success).toBe(true);
  });

  it("aplica default 'main' quando station_id está ausente", () => {
    const result = ingestRequestSchema.safeParse({ readings: [validReading] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.station_id).toBe("main");
    }
  });

  it("rejeita station_id vazio", () => {
    const result = ingestRequestSchema.safeParse({ station_id: "", readings: [] });

    expect(result.success).toBe(false);
  });

  it("aceita readings vazio ([]) como no-op válido", () => {
    const result = ingestRequestSchema.safeParse({ station_id: "main", readings: [] });

    expect(result.success).toBe(true);
  });

  it("rejeita quando readings não é um array", () => {
    const result = ingestRequestSchema.safeParse({ station_id: "main", readings: "not-an-array" });

    expect(result.success).toBe(false);
  });

  it("aceita um lote de exatamente MAX_BATCH leituras", () => {
    const readings = Array.from({ length: MAX_BATCH }, () => validReading);
    const result = ingestRequestSchema.safeParse({ station_id: "main", readings });

    expect(result.success).toBe(true);
  });

  it("rejeita um lote com mais de MAX_BATCH leituras", () => {
    const readings = Array.from({ length: MAX_BATCH + 1 }, () => validReading);
    const result = ingestRequestSchema.safeParse({ station_id: "main", readings });

    expect(result.success).toBe(false);
  });

  it("rejeita corpo sem a chave readings", () => {
    const result = ingestRequestSchema.safeParse({ station_id: "main" });

    expect(result.success).toBe(false);
  });

  it("MAX_BATCH é 5000 (contrato do design)", () => {
    expect(MAX_BATCH).toBe(5000);
  });
});
