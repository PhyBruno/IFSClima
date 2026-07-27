import { describe, expect, it } from "vitest";
import type { ReadingRow } from "../../src/repositories/reading-repository.js";
import { streamCsv } from "../../src/exporters/csv.js";

async function* rowsOf(rows: ReadingRow[]): AsyncGenerator<ReadingRow> {
  for (const row of rows) {
    yield row;
  }
}

async function collect(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function row(overrides: Partial<ReadingRow> = {}): ReadingRow {
  return {
    timestamp: new Date("2026-07-23T14:30:00.000Z"),
    temperatureC: 24.7,
    humidityPct: 61.2,
    pressureHpa: 1013.4,
    rainMm: 0.4,
    uvIndex: 5.3,
    ...overrides,
  };
}

describe("streamCsv (T8.3 — HIST-06, HIST-08)", () => {
  it("produz cabeçalho + uma linha por leitura, timestamp ISO UTC", async () => {
    const csv = await collect(streamCsv(rowsOf([row()])));
    const lines = csv.trim().split("\n");

    expect(lines[0]).toBe("timestamp,temperature_c,humidity_pct,pressure_hpa,rain_mm,uv_index");
    expect(lines[1]).toBe("2026-07-23T14:30:00.000Z,24.7,61.2,1013.4,0.4,5.3");
  });

  it("valores nulos viram string vazia (HIST-08)", async () => {
    const csv = await collect(
      streamCsv(
        rowsOf([
          row({
            temperatureC: null,
            humidityPct: null,
            pressureHpa: null,
            rainMm: null,
            uvIndex: null,
          }),
        ]),
      ),
    );
    const lines = csv.trim().split("\n");

    expect(lines[1]).toBe("2026-07-23T14:30:00.000Z,,,,,");
  });

  it("múltiplas leituras geram múltiplas linhas na ordem recebida", async () => {
    const csv = await collect(
      streamCsv(
        rowsOf([
          row({ timestamp: new Date("2026-07-23T14:30:00.000Z"), temperatureC: 1 }),
          row({ timestamp: new Date("2026-07-23T14:31:00.000Z"), temperatureC: 2 }),
        ]),
      ),
    );
    const lines = csv.trim().split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[1]?.startsWith("2026-07-23T14:30:00.000Z")).toBe(true);
    expect(lines[2]?.startsWith("2026-07-23T14:31:00.000Z")).toBe(true);
  });

  it("intervalo vazio → arquivo só com cabeçalho (HIST-08)", async () => {
    const csv = await collect(streamCsv(rowsOf([])));

    expect(csv.trim()).toBe("timestamp,temperature_c,humidity_pct,pressure_hpa,rain_mm,uv_index");
  });
});
