import type { Readable } from "node:stream";
import { streamCsv } from "../exporters/csv.js";
import { streamXlsx } from "../exporters/xlsx.js";
import type {
  FindRangeParams,
  ReadingRepository,
  ReadingRow,
} from "../repositories/reading-repository.js";
import type { ExportFormat, Order } from "../schemas/history.js";

/** `HistoryService` só precisa das operações de intervalo — nunca das de ingestão (T8.4). */
export type HistoryRepository = Pick<ReadingRepository, "findRange" | "streamRange">;

export interface ListParams {
  stationId: string;
  /** ISO 8601. Ausente → default de últimas 24h (HIST-05), resolvido via `clock`. */
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  order: Order;
}

export interface HistoryReadingResult {
  timestamp: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  rain_mm: number | null;
  uv_index: number | null;
}

export interface ListResult {
  from: string;
  to: string;
  page: number;
  page_size: number;
  total: number;
  readings: HistoryReadingResult[];
}

export interface ExportParams {
  stationId: string;
  from?: string;
  to?: string;
  format: ExportFormat;
}

export interface ExportResult {
  stream: Readable;
  contentType: string;
  filename: string;
}

export interface HistoryService {
  list(params: ListParams): Promise<ListResult>;
  exportStream(params: ExportParams): ExportResult;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const CONTENT_TYPE_BY_FORMAT: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * Resolve `from`/`to` opcionais para um intervalo `[Date, Date]` efetivo.
 * Cada lado é defaultado de forma independente (HIST-05): `from` ausente →
 * `now - 24h`; `to` ausente → `now`. Isso permite, por exemplo, informar só
 * `from` e deixar `to` cair no "agora" (T8.1 — schema já aceita essa
 * combinação parcial).
 */
function resolveRange(from: string | undefined, to: string | undefined, now: Date): [Date, Date] {
  const resolvedTo = to !== undefined ? new Date(to) : now;
  const resolvedFrom = from !== undefined ? new Date(from) : new Date(now.getTime() - MS_PER_DAY);

  return [resolvedFrom, resolvedTo];
}

function toHistoryReadingResult(row: ReadingRow): HistoryReadingResult {
  return {
    timestamp: row.timestamp.toISOString(),
    temperature_c: row.temperatureC,
    humidity_pct: row.humidityPct,
    pressure_hpa: row.pressureHpa,
    rain_mm: row.rainMm,
    uv_index: row.uvIndex,
  };
}

/** `YYYY-MM-DD` a partir de um `Date` (design.md — nome do arquivo de export). */
function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

class DefaultHistoryService implements HistoryService {
  constructor(
    private readonly repository: HistoryRepository,
    private readonly clock: () => Date,
  ) {}

  async list(params: ListParams): Promise<ListResult> {
    const [from, to] = resolveRange(params.from, params.to, this.clock());

    const findRangeParams: FindRangeParams = {
      stationId: params.stationId,
      from,
      to,
      page: params.page,
      pageSize: params.pageSize,
      order: params.order,
    };

    const { rows, total } = await this.repository.findRange(findRangeParams);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      page: params.page,
      page_size: params.pageSize,
      total,
      readings: rows.map(toHistoryReadingResult),
    };
  }

  exportStream(params: ExportParams): ExportResult {
    const [from, to] = resolveRange(params.from, params.to, this.clock());
    const rows = this.repository.streamRange(params.stationId, from, to, "asc");

    const stream = params.format === "csv" ? streamCsv(rows) : streamXlsx(rows);
    const ext = params.format === "csv" ? "csv" : "xlsx";

    return {
      stream,
      contentType: CONTENT_TYPE_BY_FORMAT[params.format],
      filename: `readings_${dateOnly(from)}_${dateOnly(to)}.${ext}`,
    };
  }
}

export function createHistoryService(
  repository: HistoryRepository,
  clock: () => Date = () => new Date(),
): HistoryService {
  return new DefaultHistoryService(repository, clock);
}
