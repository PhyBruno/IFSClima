import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Config do drizzle-kit (usado só pela CLI: `npm run db:generate`).
 * `out` aponta para `db/migrations` na raiz do monorepo — ver `db/README.md`
 * para o porquê dessa localização (reservada desde F1).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "../db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
});
