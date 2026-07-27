import net from "node:net";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeDb, createDb, getDb } from "../../src/db/client.js";
import { startTestPostgres, type TestPostgres } from "../db/helpers/testPostgres.js";

/**
 * Servidor TCP que aceita a conexão mas nunca escreve nada de volta — simula
 * um Postgres "blackhole" (host pausado, partição de rede: TCP nunca erra,
 * só nunca responde). Usado pra confirmar que `/health` não fica pendurado
 * pra sempre (code review F7, achado 2 — `connectionTimeoutMillis`).
 */
async function startBlackholeServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const sockets = new Set<import("node:net").Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {
      // Ignora ECONNRESET etc. quando o client (pg) desiste e destrói o socket.
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("endereço TCP inesperado do servidor blackhole");
  }

  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve) => {
        // O client (pg) já destrói sua ponta ao estourar o
        // connectionTimeoutMillis, mas o socket aceito aqui do lado do
        // servidor pode persistir aberto até o SO propagar o FIN/RST — sem
        // destruí-lo explicitamente, `server.close()` (que só finaliza
        // quando TODAS as conexões encerram) pode nunca chamar o callback e
        // pendurar o teste.
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      }),
  };
}

describe("GET /health — integração com Postgres real (T7.2 — QA-09)", () => {
  let testPg: TestPostgres;

  beforeAll(async () => {
    testPg = await startTestPostgres();
  }, 60000);

  afterAll(async () => {
    await testPg.stop();
  }, 30000);

  it("200 { status: 'ok' } quando o banco real responde a SELECT 1", async () => {
    const app = buildApp({
      checkDb: async () => {
        await testPg.db.execute(sql`select 1`);
      },
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("edge: 503 { status: 'unhealthy' } quando a conexão é um pool já fechado, sem lançar exceção", async () => {
    const { db, pool } = createDb(testPg.databaseUrl);
    await closeDb(pool); // simula "o db caiu" fechando o pool antes de usá-lo

    const app = buildApp({
      checkDb: async () => {
        await db.execute(sql`select 1`);
      },
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unhealthy" });

    await app.close();
  });

  it("edge: 503 { status: 'unhealthy' } quando a conexão aponta para um host inválido, sem lançar exceção", async () => {
    const { db, pool } = createDb("postgres://invalid:invalid@127.0.0.1:1/nope");

    const app = buildApp({
      checkDb: async () => {
        await db.execute(sql`select 1`);
      },
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unhealthy" });

    await app.close();
    await closeDb(pool);
  });

  it(
    "edge: 503 { status: 'unhealthy' } dentro de poucos segundos quando o banco é 'blackhole' (aceita TCP mas nunca responde) — não pendura pra sempre (code review F7, achado 2)",
    async () => {
      const blackhole = await startBlackholeServer();
      const { db, pool } = createDb(`postgres://blackhole:blackhole@127.0.0.1:${blackhole.port}/blackhole`);

      const app = buildApp({
        checkDb: async () => {
          await db.execute(sql`select 1`);
        },
      });

      try {
        const start = Date.now();
        const response = await app.inject({ method: "GET", url: "/health" });
        const elapsedMs = Date.now() - start;

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({ status: "unhealthy" });
        // Sem connectionTimeoutMillis, isso ficaria pendurado até o timeout
        // de TCP do SO (minutos); com 5000ms configurado em createDb, deve
        // responder bem antes disso.
        expect(elapsedMs).toBeLessThan(9000);
      } finally {
        await app.close();
        await closeDb(pool);
        await blackhole.close();
      }
    },
    15000,
  );
});

describe("GET /health — default checkDb (buildApp() sem options, via getDb() real)", () => {
  let testPg: TestPostgres;
  let app: FastifyInstance;
  let originalDatabaseUrl: string | undefined;
  let originalIngestApiKey: string | undefined;

  beforeAll(async () => {
    testPg = await startTestPostgres();

    // Sem NENHUMA option: healthRoute resolve a checagem via getDb() real,
    // preguiçosamente — só quando GET /health é de fato chamado (mesmo
    // espírito de lazyDrizzleReadingRepository/getIngestApiKey em app.ts).
    originalDatabaseUrl = process.env.DATABASE_URL;
    originalIngestApiKey = process.env.INGEST_API_KEY;
    process.env.DATABASE_URL = testPg.databaseUrl;
    process.env.INGEST_API_KEY = "whs_test_ABC123";

    app = buildApp();
  }, 60000);

  afterAll(async () => {
    await app.close();
    const { pool } = getDb();
    await closeDb(pool);
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.INGEST_API_KEY = originalIngestApiKey;
    await testPg.stop();
  }, 30000);

  it("200 { status: 'ok' } usando o client Drizzle padrão resolvido a partir do env", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
