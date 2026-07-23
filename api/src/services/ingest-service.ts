import type { NewReadingRow, ReadingRepository } from "../repositories/reading-repository.js";
import type { IngestRequest, Reading } from "../schemas/ingest.js";

export interface RejectedReading {
  index: number;
  reason: string;
}

export interface IngestResult {
  accepted: number;
  duplicates: number;
  rejected: RejectedReading[];
}

export interface IngestService {
  ingest(request: IngestRequest): Promise<IngestResult>;
}

/**
 * Faixas físicas válidas por sensor (PROJECT.md/design.md). Zod (T3.1) só
 * valida estrutura/tipo; estas faixas são checadas aqui para permitir
 * rejeição POR ITEM (ING-03/ING-07) sem derrubar o lote inteiro.
 *
 * `rain_mm` não tem teto superior (PROJECT.md: `[0, ∞)`) — só é rejeitado
 * se negativo. Usamos `Infinity` como max para reaproveitar a mesma
 * verificação genérica abaixo sem casos especiais.
 */
export const PHYSICAL_RANGES = {
  temperature_c: [-90, 60],
  humidity_pct: [0, 100],
  pressure_hpa: [300, 1100],
  rain_mm: [0, Infinity],
  uv_index: [0, 20],
} as const;

/** Tolerância de clock: timestamp mais que isso no futuro é rejeitado (ING-10). */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

type RangeField = keyof typeof PHYSICAL_RANGES;
const RANGE_FIELDS = Object.keys(PHYSICAL_RANGES) as RangeField[];

type ValidationOutcome = { valid: true } | { valid: false; reason: string };

/**
 * Valida uma leitura já estruturalmente válida (pós-Zod): timestamp não
 * pode ser inválido nem futuro demais; sensores presentes precisam estar
 * dentro da faixa física. Sensores ausentes/nulos são sempre válidos.
 */
export function validateReading(reading: Reading, now: Date): ValidationOutcome {
  const timestampMs = new Date(reading.timestamp).getTime();

  if (Number.isNaN(timestampMs)) {
    return { valid: false, reason: "timestamp is invalid" };
  }

  if (timestampMs > now.getTime() + FUTURE_TOLERANCE_MS) {
    return { valid: false, reason: "timestamp is in the future" };
  }

  for (const field of RANGE_FIELDS) {
    const value = reading[field];

    if (value === null || value === undefined) {
      continue;
    }

    const [min, max] = PHYSICAL_RANGES[field];
    if (value < min || value > max) {
      return { valid: false, reason: `${field} out of range (min ${min}, max ${max})` };
    }
  }

  return { valid: true };
}

function toNewReadingRow(
  stationId: string,
  reading: Reading,
  normalizedIso: string,
): NewReadingRow {
  return {
    stationId,
    timestamp: new Date(normalizedIso),
    temperatureC: reading.temperature_c ?? null,
    humidityPct: reading.humidity_pct ?? null,
    pressureHpa: reading.pressure_hpa ?? null,
    rainMm: reading.rain_mm ?? null,
    uvIndex: reading.uv_index ?? null,
  };
}

class DefaultIngestService implements IngestService {
  constructor(
    private readonly repository: ReadingRepository,
    private readonly clock: () => Date,
  ) {}

  async ingest(request: IngestRequest): Promise<IngestResult> {
    const now = this.clock();
    const rejected: RejectedReading[] = [];
    const validRows = new Map<string, NewReadingRow>();
    let validCount = 0;

    request.readings.forEach((reading, index) => {
      const outcome = validateReading(reading, now);

      if (!outcome.valid) {
        rejected.push({ index, reason: outcome.reason });
        return;
      }

      validCount += 1;

      // Normaliza para UTC (design.md — "sempre converter para UTC no
      // service") ANTES da chave de dedupe, para que timestamps
      // equivalentes em offsets diferentes colapsem no mesmo instante.
      const normalizedIso = new Date(reading.timestamp).toISOString();
      const key = `${request.station_id}|${normalizedIso}`;

      // Dedupe intra-lote (ING-09): mantém a primeira ocorrência da chave;
      // as demais são contadas em `duplicates` via `validCount - inserted`.
      if (!validRows.has(key)) {
        validRows.set(key, toNewReadingRow(request.station_id, reading, normalizedIso));
      }
    });

    if (validRows.size === 0) {
      // readings:[] ou nenhuma leitura válida → no-op, sem tocar o repositório.
      return { accepted: 0, duplicates: 0, rejected };
    }

    await this.repository.ensureStation(request.station_id);
    const insertedCount = await this.repository.insertIgnoreConflicts([...validRows.values()]);

    // accepted = linhas realmente inseridas; duplicates = válidas - inseridas
    // (cobre duplicata intra-lote E reenvio de leitura já persistida — design.md).
    return {
      accepted: insertedCount,
      duplicates: validCount - insertedCount,
      rejected,
    };
  }
}

export function createIngestService(
  repository: ReadingRepository,
  clock: () => Date = () => new Date(),
): IngestService {
  return new DefaultIngestService(repository, clock);
}
