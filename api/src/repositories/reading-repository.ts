import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { readings, stations } from "../db/schema.js";
import { METRIC_COLUMNS, type Metric } from "../schemas/readings.js";

/** Linha pronta para persistir — já normalizada pelo `IngestService` (T3.3). */
export interface NewReadingRow {
  stationId: string;
  timestamp: Date;
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  rainMm: number | null;
  uvIndex: number | null;
}

/** Última leitura de uma estação (T4.2 — READ-01, READ-02). */
export interface LatestReadingRow {
  timestamp: Date;
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  rainMm: number | null;
  uvIndex: number | null;
}

/** Granularidade do bucket de agregação (design.md — bucketing por range). */
export type BucketUnit = "hour" | "day";

/** Um bucket agregado (T4.2 — READ-05, READ-10). `sum` só é preenchido p/ `rain_mm`. */
export interface AggregateBucketRow {
  bucket: Date;
  avg: number | null;
  min: number | null;
  max: number | null;
  sum: number | null;
}

/**
 * Porta de persistência da ingestão e leitura (Clean-ish: service depende
 * desta interface, não da implementação Drizzle — testável com fake/in-memory).
 */
export interface ReadingRepository {
  /** Garante que a estação exista (upsert), sem sobrescrever nome já curado. */
  ensureStation(id: string): Promise<void>;
  /**
   * Insere as linhas ignorando conflitos de `(station_id, timestamp)`
   * (idempotência — ING-02). Retorna quantas linhas foram REALMENTE
   * inseridas (não conta as ignoradas por conflito).
   */
  insertIgnoreConflicts(rows: NewReadingRow[]): Promise<number>;
  /** Leitura de maior `timestamp` da estação, ou `null` se não há nenhuma (READ-01, READ-03). */
  findLatest(stationId: string): Promise<LatestReadingRow | null>;
  /**
   * Agrega `metric` da estação desde `since` (inclusive), agrupado por
   * `bucketUnit` (`date_trunc`). `metric` só indexa a whitelist
   * `METRIC_COLUMNS` — nunca é interpolada em SQL cru (design.md — Segurança).
   */
  aggregate(
    stationId: string,
    metric: Metric,
    since: Date,
    bucketUnit: BucketUnit,
  ): Promise<AggregateBucketRow[]>;
}

/** Tamanho do chunk por statement de insert (mitigação de "bulk insert grande" — design.md). */
export const CHUNK_SIZE = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

/** Implementação Drizzle/Postgres de `ReadingRepository` (T3.2). */
export class DrizzleReadingRepository implements ReadingRepository {
  constructor(private readonly db: Database) {}

  async ensureStation(id: string): Promise<void> {
    await this.db
      .insert(stations)
      .values({ id, name: id })
      .onConflictDoNothing({ target: stations.id });
  }

  async insertIgnoreConflicts(rows: NewReadingRow[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }

    let insertedCount = 0;

    for (const batch of chunk(rows, CHUNK_SIZE)) {
      const inserted = await this.db
        .insert(readings)
        .values(
          batch.map((row) => ({
            stationId: row.stationId,
            timestamp: row.timestamp,
            temperatureC: row.temperatureC,
            humidityPct: row.humidityPct,
            pressureHpa: row.pressureHpa,
            rainMm: row.rainMm,
            uvIndex: row.uvIndex,
          })),
        )
        .onConflictDoNothing({ target: [readings.stationId, readings.timestamp] })
        .returning({ id: readings.id });

      insertedCount += inserted.length;
    }

    return insertedCount;
  }

  async findLatest(stationId: string): Promise<LatestReadingRow | null> {
    const rows = await this.db
      .select({
        timestamp: readings.timestamp,
        temperatureC: readings.temperatureC,
        humidityPct: readings.humidityPct,
        pressureHpa: readings.pressureHpa,
        rainMm: readings.rainMm,
        uvIndex: readings.uvIndex,
      })
      .from(readings)
      .where(eq(readings.stationId, stationId))
      .orderBy(desc(readings.timestamp))
      .limit(1);

    return rows[0] ?? null;
  }

  async aggregate(
    stationId: string,
    metric: Metric,
    since: Date,
    bucketUnit: BucketUnit,
  ): Promise<AggregateBucketRow[]> {
    const column = METRIC_COLUMNS[metric];
    // `sum` só faz sentido para rain_mm (chuva acumulada — READ-10, design.md).
    const sumExpr = metric === "rain_mm" ? sql`sum(${column})` : sql`NULL`;

    const result = await this.db.execute<{
      bucket: Date;
      avg: number | string | null;
      min: number | string | null;
      max: number | string | null;
      sum: number | string | null;
    }>(sql`
      SELECT date_trunc(${bucketUnit}, ${readings.timestamp}) AS bucket,
             avg(${column}) AS avg,
             min(${column}) AS min,
             max(${column}) AS max,
             ${sumExpr} AS sum
      FROM ${readings}
      WHERE ${readings.stationId} = ${stationId} AND ${readings.timestamp} >= ${since}
      GROUP BY bucket
      ORDER BY bucket
    `);

    return result.rows.map((row) => ({
      bucket: new Date(row.bucket),
      avg: row.avg === null ? null : Number(row.avg),
      min: row.min === null ? null : Number(row.min),
      max: row.max === null ? null : Number(row.max),
      sum: row.sum === null ? null : Number(row.sum),
    }));
  }
}
