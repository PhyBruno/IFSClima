import { buildApp } from "./app.js";
import { parseEnv } from "./config/env.js";
import { getDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { seedMainStation } from "./db/seed.js";

async function main(): Promise<void> {
  let env;

  try {
    env = parseEnv();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
    return;
  }

  // T2.4: roda migrations e garante a estação `main` no boot, antes de
  // aceitar tráfego. Idempotente — seguro em todo restart do container.
  try {
    const { db } = getDb();
    await runMigrations(db);
    await seedMainStation(db);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[db] falha ao aplicar migrations/seed no boot:", error);
    process.exit(1);
    return;
  }

  const app = buildApp();

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
