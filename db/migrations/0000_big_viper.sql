CREATE TABLE "readings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"station_id" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"temperature_c" real,
	"humidity_pct" real,
	"pressure_hpa" real,
	"rain_mm" real,
	"uv_index" real,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "readings_station_id_timestamp_unique" UNIQUE("station_id","timestamp")
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "readings_station_id_timestamp_idx" ON "readings" USING btree ("station_id","timestamp" DESC NULLS LAST);