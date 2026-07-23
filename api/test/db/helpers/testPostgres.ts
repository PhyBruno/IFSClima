import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import type pg from "pg";
import { closeDb, createDb, type Database } from "../../../src/db/client.js";

export interface TestPostgres {
  db: Database;
  pool: pg.Pool;
  databaseUrl: string;
  stop: () => Promise<void>;
}

/**
 * Sobe um Postgres 16 efêmero via Testcontainers para os testes de
 * integração de F2 (schema/migrations). Cada teste que chama isto recebe um
 * banco limpo e isolado — sem depender do serviço `db` do docker-compose
 * estar de pé, e sem risco de colidir com dados reais.
 */
export async function startTestPostgres(): Promise<TestPostgres> {
  const user = "estacao_test";
  const password = "estacao_test_pw";
  const database = "estacao_test_db";

  const container: StartedTestContainer = await new GenericContainer("postgres:16-alpine")
    .withEnvironment({
      POSTGRES_USER: user,
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: database,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  const databaseUrl = `postgres://${user}:${password}@${container.getHost()}:${container.getMappedPort(5432)}/${database}`;
  const { db, pool } = createDb(databaseUrl);

  return {
    db,
    pool,
    databaseUrl,
    stop: async () => {
      await closeDb(pool);
      await container.stop();
    },
  };
}
