import { z } from "zod";

/**
 * Tamanho máximo de leituras por lote (T3.1 / ING-08). É o teto estrutural
 * validado pelo Zod; o valor efetivo usado para decidir 413 em runtime é
 * configurável (env `MAX_BATCH`, ver `config/env.ts`) mas nunca excede este
 * teto (ver `routes/ingest.ts`).
 */
export const MAX_BATCH = 5000;

/**
 * Contrato de uma leitura individual (fonte única de verdade — PROJECT.md).
 * Zod valida apenas ESTRUTURA aqui (tipos + presença): faixas físicas e
 * timestamp futuro são responsabilidade de `services/ingest-service.ts`,
 * para permitir rejeição por item (ING-03) em vez de derrubar o lote
 * inteiro quando um único valor está fora de faixa.
 */
export const readingSchema = z.object({
  timestamp: z.string().datetime({ offset: true }),
  temperature_c: z.number().nullish(),
  humidity_pct: z.number().nullish(),
  pressure_hpa: z.number().nullish(),
  rain_mm: z.number().nullish(),
  uv_index: z.number().nullish(),
  uv_voltage_v: z.number().nullish(),
});

/** Contrato do corpo de `POST /api/v1/ingest` (PROJECT.md). */
export const ingestRequestSchema = z.object({
  station_id: z.string().min(1).default("main"),
  readings: z.array(readingSchema).max(MAX_BATCH),
});

export type Reading = z.infer<typeof readingSchema>;
export type IngestRequest = z.infer<typeof ingestRequestSchema>;
