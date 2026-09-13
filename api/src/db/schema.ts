import { sql } from "drizzle-orm";
import { bigserial, index, pgTable, real, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Estação meteorológica. Preparado para multi-estação (D3), mas o v1 usa
 * apenas a estação seed `main` (ver src/db/seed.ts).
 */
export const stations = pgTable("stations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
});

/**
 * Leituras individuais de sensores. `timestamp` é o momento da LEITURA (UTC,
 * definido pela estação); `receivedAt` é o momento em que a API recebeu o
 * dado — distinção necessária para auditar lotes atrasados (F3).
 *
 * Idempotência (D6): UNIQUE(station_id, timestamp) permite `ON CONFLICT DO
 * NOTHING` na ingestão, garantida a nível de banco.
 */
export const readings = pgTable(
  "readings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    stationId: text("station_id")
      .notNull()
      .references(() => stations.id),
    timestamp: timestamp("timestamp", { withTimezone: true, mode: "date" }).notNull(),
    temperatureC: real("temperature_c"),
    humidityPct: real("humidity_pct"),
    pressureHpa: real("pressure_hpa"),
    rainMm: real("rain_mm"),
    uvIndex: real("uv_index"),
    // Tensao bruta lida no ADC para o sensor UV. O uv_index e derivado dela por
    // uma tabela de limiares que depende do GANHO do modulo (clones do
    // GUVA-S12SD variam), e a conversao e quantizada: do indice nao se volta
    // para a tensao. Guardar o valor bruto permite reprocessar o historico de
    // UV se a calibracao mudar. Nulo quando nao ha sensor UV.
    uvVoltageV: real("uv_voltage_v"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    unique("readings_station_id_timestamp_unique").on(table.stationId, table.timestamp),
    index("readings_station_id_timestamp_idx").on(table.stationId, table.timestamp.desc()),
  ],
);

export type Station = typeof stations.$inferSelect;
export type NewStation = typeof stations.$inferInsert;
export type Reading = typeof readings.$inferSelect;
export type NewReading = typeof readings.$inferInsert;
