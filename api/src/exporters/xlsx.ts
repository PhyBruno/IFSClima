import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import type { ReadingRow } from "../repositories/reading-repository.js";

/** Nome único da planilha exportada (design.md — "1 planilha Leituras"). */
export const SHEET_NAME = "Leituras";

/** Mesma ordem de colunas do CSV (T8.3 — HIST-07). */
const HEADER_CELLS = [
  "timestamp",
  "temperature_c",
  "humidity_pct",
  "pressure_hpa",
  "rain_mm",
  "uv_index",
];

function toRowValues(row: ReadingRow): unknown[] {
  return [
    row.timestamp.toISOString(),
    row.temperatureC,
    row.humidityPct,
    row.pressureHpa,
    row.rainMm,
    row.uvIndex,
  ];
}

/**
 * Produz um XLSX em streaming (`exceljs` `WorkbookWriter`) a partir de uma
 * fonte assíncrona de linhas — nunca materializa o workbook inteiro em
 * memória (HIST-09). Retorna um `Readable` (na prática, o lado de leitura do
 * `PassThrough` para o qual o `WorkbookWriter` escreve).
 *
 * Cabeçalho em negrito, planilha única "Leituras", timestamp ISO UTC, nulos
 * viram célula vazia (HIST-08).
 */
export function streamXlsx(rows: AsyncIterable<ReadingRow>): PassThrough {
  const output = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: output,
    useStyles: true,
  });
  const sheet = workbook.addWorksheet(SHEET_NAME);

  const headerRow = sheet.addRow(HEADER_CELLS);
  headerRow.font = { bold: true };
  headerRow.commit();

  void (async () => {
    try {
      for await (const row of rows) {
        // Cliente desconectou (aba fechada, timeout de proxy) — `output`
        // (o `PassThrough`) já foi destruído. Sem essa checagem, o `for
        // await` continuaria consumindo `rows` (e `streamRange` continuaria
        // paginando o Postgres) indefinidamente, mesmo sem ninguém pra ler
        // o resultado (F8 — achado 1). `break` aqui encerra o `for await`,
        // o que chama automaticamente `rows.return?.()` — interrompe o
        // generator (e a paginação) o quanto antes.
        if (output.destroyed) {
          break;
        }

        sheet.addRow(toRowValues(row)).commit();
      }

      if (!output.destroyed) {
        sheet.commit();
        await workbook.commit();
      }
    } catch (error) {
      if (!output.destroyed) {
        output.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    }
  })();

  return output;
}
