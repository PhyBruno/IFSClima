import type {
  AggregateBucketRow,
  BucketUnit,
  LatestReadingRow,
  ReadingRepository,
} from "../repositories/reading-repository.js";
import type { Metric, Range } from "../schemas/readings.js";

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
  range: Range;
  bucket: BucketUnit;
  buckets: SeriesBucketResult[];
}

export interface ReadingsService {
  getLatest(stationId: string): Promise<LatestReadingResult>;
  getSeries(stationId: string, metric: Metric, range: Range): Promise<SeriesResult>;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** `range` → (janela de lookback, granularidade do bucket) — design.md, "Bucketing". */
const RANGE_CONFIG: Record<Range, { lookbackMs: number; bucket: BucketUnit }> = {
  "24h": { lookbackMs: 24 * MS_PER_HOUR, bucket: "hour" },
  "7d": { lookbackMs: 7 * MS_PER_DAY, bucket: "hour" },
  "30d": { lookbackMs: 30 * MS_PER_DAY, bucket: "day" },
};

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

  async getSeries(stationId: string, metric: Metric, range: Range): Promise<SeriesResult> {
    const { lookbackMs, bucket } = RANGE_CONFIG[range];
    const since = new Date(this.clock().getTime() - lookbackMs);

    const rows = await this.repository.aggregate(stationId, metric, since, bucket);

    return {
      metric,
      range,
      bucket,
      buckets: rows.map(toBucketResult),
    };
  }
}

export function createReadingsService(
  repository: ReadingRepository,
  clock: () => Date = () => new Date(),
): ReadingsService {
  return new DefaultReadingsService(repository, clock);
}
