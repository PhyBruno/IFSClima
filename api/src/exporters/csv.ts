import { Readable } from "node:stream";
import type { ReadingRow } from "../repositories/reading-repository.js";

/** Cabeçalho do CSV (T8.3 — HIST-06). Ordem igual ao contrato do XLSX (T8.3). */
const HEADER = "timestamp,temperature_c,humidity_pct,pressure_hpa,rain_mm,uv_index\n";

/** Nulo vira string vazia (HIST-08) — Excel/planilhas tratam célula vazia melhor que a string "null". */
function csvValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function csvLine(row: ReadingRow): string {
  return (
    [
      row.timestamp.toISOString(),
      csvValue(row.temperatureC),
      csvValue(row.humidityPct),
      csvValue(row.pressureHpa),
      csvValue(row.rainMm),
      csvValue(row.uvIndex),
    ].join(",") + "\n"
  );
}

async function* generateCsv(rows: AsyncIterable<ReadingRow>): AsyncGenerator<string> {
  yield HEADER;

  for await (const row of rows) {
    yield csvLine(row);
  }
}

/**
 * Produz um CSV em streaming a partir de uma fonte assíncrona de linhas
 * (ex.: `ReadingRepository.streamRange`, T8.2) — nunca materializa o arquivo
 * inteiro em memória (HIST-09). Intervalo vazio produz só o cabeçalho
 * (HIST-08).
 */
export function streamCsv(rows: AsyncIterable<ReadingRow>): Readable {
  return Readable.from(generateCsv(rows));
}
