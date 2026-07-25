import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { ReadingRow } from "../../src/repositories/reading-repository.js";
import { streamXlsx } from "../../src/exporters/xlsx.js";

async function* rowsOf(rows: ReadingRow[]): AsyncGenerator<ReadingRow> {
  for (const row of rows) {
    yield row;
  }
}

async function collectBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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

async function readBack(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

describe("streamXlsx (T8.3 — HIST-07, HIST-08)", () => {
  it("gera uma única planilha 'Leituras' com cabeçalho em negrito", async () => {
    const buffer = await collectBuffer(streamXlsx(rowsOf([row()])));
    const workbook = await readBack(buffer);

    expect(workbook.worksheets).toHaveLength(1);
    const sheet = workbook.getWorksheet("Leituras");
    expect(sheet).toBeDefined();

    const headerRow = sheet?.getRow(1);
    expect(headerRow?.values).toEqual([
      undefined,
      "timestamp",
      "temperature_c",
      "humidity_pct",
      "pressure_hpa",
      "rain_mm",
      "uv_index",
    ]);
    expect(headerRow?.getCell(1).font?.bold).toBe(true);
  });

  it("linhas refletem as leituras, timestamp ISO UTC e nulos vazios (HIST-08)", async () => {
    const buffer = await collectBuffer(
      streamXlsx(
        rowsOf([
          row(),
          row({
            timestamp: new Date("2026-07-23T14:35:00.000Z"),
            temperatureC: null,
            humidityPct: null,
            pressureHpa: null,
            rainMm: null,
            uvIndex: null,
          }),
        ]),
      ),
    );
    const workbook = await readBack(buffer);
    const sheet = workbook.getWorksheet("Leituras");

    expect(sheet?.rowCount).toBe(3); // cabeçalho + 2 leituras

    const firstDataRow = sheet?.getRow(2);
    expect(firstDataRow?.getCell(1).value).toBe("2026-07-23T14:30:00.000Z");
    expect(firstDataRow?.getCell(2).value).toBe(24.7);

    const secondDataRow = sheet?.getRow(3);
    expect(secondDataRow?.getCell(1).value).toBe("2026-07-23T14:35:00.000Z");
    expect(secondDataRow?.getCell(2).value).toBeNull();
  });

  it("intervalo vazio → planilha só com cabeçalho (HIST-08)", async () => {
    const buffer = await collectBuffer(streamXlsx(rowsOf([])));
    const workbook = await readBack(buffer);
    const sheet = workbook.getWorksheet("Leituras");

    expect(sheet?.rowCount).toBe(1);
  });

  it("cancela o consumo do generator quando o cliente desconecta (F8 — achado 1)", async () => {
    const state = { advanced: 0, returned: false };

    // Generator FAKE controlado pelo teste: nunca termina sozinho (simula
    // `streamRange` paginando um export grande) e conta quantas vezes foi
    // avançado (quantos `.next()` resultaram em um `yield`), além de marcar
    // se `.return()` foi chamado (o `finally` só roda quando o consumidor
    // para de iterar via `break`/`return()`, nunca em iteração normal).
    async function* infiniteRows(): AsyncGenerator<ReadingRow> {
      try {
        for (let i = 0; ; i++) {
          state.advanced += 1;
          yield row({ temperatureC: i });
          // Pequeno delay pra dar chance ao teste de destruir `output`
          // entre uma linha e outra (sem isso, o loop síncrono poderia
          // rodar várias iterações antes do teste conseguir agir).
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      } finally {
        state.returned = true;
      }
    }

    const output = streamXlsx(infiniteRows());
    // Drena o stream (produção também não espera por leitor nenhum, mas
    // isso evita que o `PassThrough` acumule backpressure e afete o teste).
    output.resume();

    // Deixa o generator avançar algumas iterações antes de "desconectar".
    await new Promise((resolve) => setTimeout(resolve, 12));
    const advancedBeforeDestroy = state.advanced;
    expect(advancedBeforeDestroy).toBeGreaterThan(0);

    output.destroy();

    // Tempo suficiente pra, SE o bug ainda existisse, o generator ter
    // avançado bem mais (a cada 5ms) — mas com a correção o `for await`
    // nota `output.destroyed` e para (chamando `.return()`) logo na
    // primeira iteração pendente após o destroy.
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(state.returned).toBe(true);
    expect(state.advanced).toBeLessThanOrEqual(advancedBeforeDestroy + 2);
  });
});
