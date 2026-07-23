import type { Database } from "../db/client.js";
import { readings, stations } from "../db/schema.js";

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

/**
 * Porta de persistência da ingestão (Clean-ish: service depende desta
 * interface, não da implementação Drizzle — testável com fake/in-memory).
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
}
