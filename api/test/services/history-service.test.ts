import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type {
  FindRangeParams,
  FindRangeResult,
  ReadingRow,
} from "../../src/repositories/reading-repository.js";
import { createHistoryService, type HistoryRepository } from "../../src/services/history-service.js";

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

class FakeRepository implements HistoryRepository {
  public lastFindRangeParams: FindRangeParams | undefined;
  public lastStreamRangeArgs: [string, Date, Date, "asc" | "desc"] | undefined;

  constructor(
    private readonly findRangeResult: FindRangeResult = { rows: [], total: 0 },
    private readonly streamRows: ReadingRow[] = [],
  ) {}

  findRange(params: FindRangeParams): Promise<FindRangeResult> {
    this.lastFindRangeParams = params;
    return Promise.resolve(this.findRangeResult);
  }

  async *streamRange(
    stationId: string,
    from: Date,
    to: Date,
    order: "asc" | "desc",
  ): AsyncGenerator<ReadingRow> {
    this.lastStreamRangeArgs = [stationId, from, to, order];
    for (const r of this.streamRows) {
      yield r;
    }
  }
}

async function collectString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function collectBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const FIXED_NOW = new Date("2026-07-23T14:30:00.000Z");

describe("HistoryService (T8.4 — HIST-01, HIST-02, HIST-05, HIST-06, HIST-07)", () => {
  describe("list", () => {
    it("mapeia paginação e leituras para o formato de resposta HTTP (snake_case)", async () => {
      const repository = new FakeRepository({
        rows: [row()],
        total: 42,
      });
      const service = createHistoryService(repository, () => FIXED_NOW);

      const result = await service.list({
        stationId: "main",
        from: "2026-07-22T14:30:00.000Z",
        to: "2026-07-23T14:30:00.000Z",
        page: 2,
        pageSize: 50,
        order: "desc",
      });

      expect(result).toEqual({
        from: "2026-07-22T14:30:00.000Z",
        to: "2026-07-23T14:30:00.000Z",
        page: 2,
        page_size: 50,
        total: 42,
        readings: [
          {
            timestamp: "2026-07-23T14:30:00.000Z",
            temperature_c: 24.7,
            humidity_pct: 61.2,
            pressure_hpa: 1013.4,
            rain_mm: 0.4,
            uv_index: 5.3,
          },
        ],
      });
      expect(repository.lastFindRangeParams).toMatchObject({
        stationId: "main",
        page: 2,
        pageSize: 50,
        order: "desc",
      });
    });

    it("HIST-05: from/to ausentes → default de últimas 24h (usa clock injetável)", async () => {
      const repository = new FakeRepository();
      const service = createHistoryService(repository, () => FIXED_NOW);

      const result = await service.list({
        stationId: "main",
        page: 1,
        pageSize: 50,
        order: "desc",
      });

      expect(result.to).toBe("2026-07-23T14:30:00.000Z");
      expect(result.from).toBe("2026-07-22T14:30:00.000Z");
      expect(repository.lastFindRangeParams?.from).toEqual(new Date("2026-07-22T14:30:00.000Z"));
      expect(repository.lastFindRangeParams?.to).toEqual(new Date("2026-07-23T14:30:00.000Z"));
    });

    it("estado vazio → total: 0, readings: []", async () => {
      const repository = new FakeRepository({ rows: [], total: 0 });
      const service = createHistoryService(repository, () => FIXED_NOW);

      const result = await service.list({ stationId: "main", page: 1, pageSize: 50, order: "desc" });

      expect(result.total).toBe(0);
      expect(result.readings).toEqual([]);
    });
  });

  describe("exportStream", () => {
    it("format=csv liga streamRange ao exporter CSV", async () => {
      const repository = new FakeRepository(undefined, [row()]);
      const service = createHistoryService(repository, () => FIXED_NOW);

      const result = service.exportStream({
        stationId: "main",
        from: "2026-07-22T14:30:00.000Z",
        to: "2026-07-23T14:30:00.000Z",
        format: "csv",
      });

      expect(result.contentType).toBe("text/csv; charset=utf-8");
      expect(result.filename).toBe("readings_2026-07-22_2026-07-23.csv");

      const content = await collectString(result.stream);
      expect(content).toContain("timestamp,temperature_c,humidity_pct,pressure_hpa,rain_mm,uv_index");
      expect(content).toContain("2026-07-23T14:30:00.000Z,24.7,61.2,1013.4,0.4,5.3");
      expect(repository.lastStreamRangeArgs?.[0]).toBe("main");
    });

    it("format=xlsx liga streamRange ao exporter XLSX", async () => {
      const repository = new FakeRepository(undefined, [row()]);
      const service = createHistoryService(repository, () => FIXED_NOW);

      const result = service.exportStream({
        stationId: "main",
        from: "2026-07-22T14:30:00.000Z",
        to: "2026-07-23T14:30:00.000Z",
        format: "xlsx",
      });

      expect(result.contentType).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(result.filename).toBe("readings_2026-07-22_2026-07-23.xlsx");

      const buffer = await collectBuffer(result.stream);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet("Leituras");
      expect(sheet?.rowCount).toBe(2);
    });

    it("HIST-05: from/to ausentes no export também usam default de últimas 24h", () => {
      const repository = new FakeRepository(undefined, []);
      const service = createHistoryService(repository, () => FIXED_NOW);

      const result = service.exportStream({ stationId: "main", format: "csv" });

      expect(result.filename).toBe("readings_2026-07-22_2026-07-23.csv");
    });
  });
});
