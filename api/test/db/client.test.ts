import net from "node:net";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, createDb, getDb } from "../../src/db/client.js";
import { startTestPostgres, type TestPostgres } from "./helpers/testPostgres.js";

/**
 * Servidor TCP que aceita a conexão mas nunca escreve nada de volta — simula
 * um Postgres "blackhole" (host pausado, partição de rede): o handshake TCP
 * completa, então o SO nunca reporta erro de conexão, mas o handshake do
 * protocolo Postgres nunca avança. Usado pelos testes de `connectionTimeoutMillis`
 * (code review F7, achado 2).
 */
async function startBlackholeServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const sockets = new Set<import("node:net").Socket>();

  const server = net.createServer((socket) => {
    // Aceita a conexão TCP e não faz nada — nunca envia bytes, nunca fecha.
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
        // O client (pg) já destrói sua ponta ao estourar o timeout, mas o
        // socket aceito aqui do lado do servidor pode persistir aberto até
        // o SO propagar o FIN/RST — sem destruí-lo explicitamente,
        // `server.close()` (que só finaliza quando TODAS as conexões
        // encerram) pode nunca chamar o callback e pendurar o teste.
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      }),
  };
}

describe("db client (T2.1 — conectividade)", () => {
  let testPg: TestPostgres;
  let getDbPool: import("pg").Pool | undefined;

  beforeAll(async () => {
    testPg = await startTestPostgres();
  }, 60000);

  afterAll(async () => {
    if (getDbPool) {
      await closeDb(getDbPool);
    }
    await testPg.stop();
  }, 30000);

  it("createDb abre uma conexão utilizável e closeDb fecha sem erro", async () => {
    const { db, pool } = createDb(testPg.databaseUrl);

    const result = await db.execute(sql`select 1 as ok`);
    expect(result.rows[0]).toEqual({ ok: 1 });

    await expect(closeDb(pool)).resolves.toBeUndefined();
  });

  it("createDb força timezone UTC na sessão, independente do default do servidor (F4 — date_trunc consistente)", async () => {
    const { db, pool } = createDb(testPg.databaseUrl);

    const result = await db.execute(sql`show timezone`);

    expect(result.rows[0]).toEqual({ TimeZone: "UTC" });

    await closeDb(pool);
  });

  it("getDb() lê DATABASE_URL do env validado (F1) e cacheia a conexão", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalIngestApiKey = process.env.INGEST_API_KEY;
    process.env.DATABASE_URL = testPg.databaseUrl;
    process.env.INGEST_API_KEY = process.env.INGEST_API_KEY ?? "whs_test_ABC123";

    try {
      const first = getDb();
      const second = getDb();
      getDbPool = first.pool;

      expect(second.pool).toBe(first.pool);
      expect(second.db).toBe(first.db);

      const result = await first.db.execute(sql`select 1 as ok`);
      expect(result.rows[0]).toEqual({ ok: 1 });
    } finally {
      process.env.DATABASE_URL = originalDatabaseUrl;
      process.env.INGEST_API_KEY = originalIngestApiKey;
    }
  });

  it("registra um listener de erro no pool — evento 'error' sintético (client ocioso que perdeu a conexão) não vira uncaughtException/não derruba o processo (code review F7, achado 1)", async () => {
    const { db, pool } = createDb(testPg.databaseUrl);

    let uncaught: unknown;
    const onUncaught = (err: unknown): void => {
      uncaught = err;
    };
    process.once("uncaughtException", onUncaught);

    try {
      // Simula exatamente o que pg-pool faz internamente quando detecta um
      // client ocioso que perdeu a conexão: `pool.emit('error', err, client)`.
      pool.emit("error", new Error("simulated idle client connection loss"));

      // Dá uma volta no event loop pra qualquer uncaughtException (que seria
      // síncrono/imediato de qualquer forma) ter chance de propagar.
      await new Promise((resolve) => setImmediate(resolve));

      expect(uncaught).toBeUndefined();

      // O pool continua utilizável depois do evento de erro sintético.
      const result = await db.execute(sql`select 1 as ok`);
      expect(result.rows[0]).toEqual({ ok: 1 });
    } finally {
      process.removeListener("uncaughtException", onUncaught);
      await closeDb(pool);
    }
  });

  it(
    "connectionTimeoutMillis: falha ao tentar conectar a um host 'blackhole' (aceita TCP mas nunca responde) em poucos segundos, não pendura pra sempre (code review F7, achado 2)",
    async () => {
      const blackhole = await startBlackholeServer();
      const { pool } = createDb(`postgres://blackhole:blackhole@127.0.0.1:${blackhole.port}/blackhole`);

      try {
        const start = Date.now();
        await expect(pool.query("select 1")).rejects.toThrow();
        const elapsedMs = Date.now() - start;

        // O timeout de conexão do SO para uma porta que nunca responde pode
        // levar minutos; com connectionTimeoutMillis: 5000 configurado em
        // createDb, a falha deve vir bem antes disso.
        expect(elapsedMs).toBeLessThan(9000);
      } finally {
        await closeDb(pool);
        await blackhole.close();
      }
    },
    15000,
  );

  it(
    "statement_timeout: cancela uma query que roda mais que o timeout configurado, sem pendurar indefinidamente (code review F7, achado 2)",
    async () => {
      const { db, pool } = createDb(testPg.databaseUrl);

      try {
        const start = Date.now();
        // pg_sleep(10) roda por 10s no servidor — bem mais que os 5s de
        // statement_timeout configurados em createDb — então a query deve
        // ser cancelada pelo Postgres bem antes de completar.
        await expect(db.execute(sql`select pg_sleep(10)`)).rejects.toThrow();
        const elapsedMs = Date.now() - start;

        expect(elapsedMs).toBeLessThan(9000);
      } finally {
        await closeDb(pool);
      }
    },
    15000,
  );
});
