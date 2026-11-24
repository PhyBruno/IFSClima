import type {
  AggregateBucketRow,
  BucketUnit,
  LatestReadingRow,
  ReadingRepository,
} from "../repositories/reading-repository.js";
import type { Metric, Range, SeriesWindow } from "../schemas/readings.js";

export interface LatestReadingResult {
  station_id: string;
  timestamp: string | null;
  age_seconds: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  rain_mm: number | null;
  uv_index: number | null;
}

export interface SeriesBucketResult {
  t: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  sum: number | null;
}

export interface SeriesResult {
  metric: Metric;
  /** Período pré-definido pedido, ou `"custom"` quando a janela veio de `from`/`to`. */
  range: Range | "custom";
  bucket: BucketUnit;
  /**
   * Janela efetivamente consultada (ISO 8601 UTC). O frontend usa estes
   * limites como domínio do eixo de tempo: um período sem leituras aparece
   * como vazio no gráfico, em vez de o eixo encolher até a extensão dos dados.
   */
  from: string;
  to: string;
  buckets: SeriesBucketResult[];
}

export interface ReadingsService {
  getLatest(stationId: string): Promise<LatestReadingResult>;
  getSeries(stationId: string, metric: Metric, window: SeriesWindow): Promise<SeriesResult>;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** `range` → (janela de lookback, granularidade do bucket) — design.md, "Bucketing". */
const RANGE_CONFIG: Record<Range, { lookbackMs: number; bucket: BucketUnit }> = {
  "24h": { lookbackMs: 24 * MS_PER_HOUR, bucket: "hour" },
  "7d": { lookbackMs: 7 * MS_PER_DAY, bucket: "hour" },
  "30d": { lookbackMs: 30 * MS_PER_DAY, bucket: "day" },
};

/**
 * Intervalo personalizado de até `CUSTOM_HOURLY_MAX_DAYS` dias é agregado por
 * hora (≤ 240 buckets, no máximo pouco mais que o preset de 7 dias); acima
 * disso, por dia — mesma lógica de densidade dos presets (7d → hora, 30d → dia).
 */
export const CUSTOM_HOURLY_MAX_DAYS = 10;

function toLatestResult(
  stationId: string,
  row: LatestReadingRow | null,
  now: Date,
): LatestReadingResult {
  if (row === null) {
    return {
      station_id: stationId,
      timestamp: null,
      age_seconds: null,
      temperature_c: null,
      humidity_pct: null,
      pressure_hpa: null,
      rain_mm: null,
      uv_index: null,
    };
  }

  // Clamp em 0: proteção contra relógio local ligeiramente atrasado em
  // relação ao timestamp já persistido (nunca reportar idade negativa).
  const ageSeconds = Math.max(0, Math.round((now.getTime() - row.timestamp.getTime()) / 1000));

  return {
    station_id: stationId,
    timestamp: row.timestamp.toISOString(),
    age_seconds: ageSeconds,
    temperature_c: row.temperatureC,
    humidity_pct: row.humidityPct,
    pressure_hpa: row.pressureHpa,
    rain_mm: row.rainMm,
    uv_index: row.uvIndex,
  };
}

function toBucketResult(row: AggregateBucketRow): SeriesBucketResult {
  return {
    t: row.bucket.toISOString(),
    avg: row.avg,
    min: row.min,
    max: row.max,
    sum: row.sum,
  };
}

class DefaultReadingsService implements ReadingsService {
  constructor(
    private readonly repository: ReadingRepository,
    private readonly clock: () => Date,
  ) {}

  async getLatest(stationId: string): Promise<LatestReadingResult> {
    const row = await this.repository.findLatest(stationId);

    return toLatestResult(stationId, row, this.clock());
  }

  async getSeries(stationId: string, metric: Metric, window: SeriesWindow): Promise<SeriesResult> {
    const { range, since, until, bucket } = this.resolveWindow(window);

    const rows = await this.repository.aggregate(stationId, metric, since, until, bucket);

    return {
      metric,
      range,
      bucket,
      from: since.toISOString(),
      to: until.toISOString(),
      buckets: rows.map(toBucketResult),
    };
  }

  private resolveWindow(window: SeriesWindow): {
    range: Range | "custom";
    since: Date;
    until: Date;
    bucket: BucketUnit;
  } {
    if ("range" in window) {
      const { lookbackMs, bucket } = RANGE_CONFIG[window.range];
      const until = this.clock();
      return {
        range: window.range,
        since: new Date(until.getTime() - lookbackMs),
        until,
        bucket,
      };
    }

    const spanMs = window.to.getTime() - window.from.getTime();
    return {
      range: "custom",
      since: window.from,
      until: window.to,
      bucket: spanMs <= CUSTOM_HOURLY_MAX_DAYS * MS_PER_DAY ? "hour" : "day",
    };
  }
}

export function createReadingsService(
  repository: ReadingRepository,
  clock: () => Date = () => new Date(),
): ReadingsService {
  return new DefaultReadingsService(repository, clock);
}
