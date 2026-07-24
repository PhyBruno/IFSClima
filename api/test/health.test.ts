import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

/**
 * Testes unitários (sem banco real) de `GET /health` (T7.2 — QA-09),
 * usando `checkDb` fake injetado via `BuildAppOptions` — o mesmo padrão de
 * DI já usado para `readingRepository`/`historyService` em `app.ts`.
 *
 * Cobertura com Postgres real (Testcontainers), incluindo o caso de
 * conexão caída/pool fechado, está em `test/routes/health.test.ts`.
 */
describe("GET /health", () => {
  it("responde 200 com { status: 'ok' } quando a checagem de banco resolve", async () => {
    const app = buildApp({ checkDb: async () => undefined });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("edge: WHEN o db cai THEN /health retorna 503 { status: 'unhealthy' }, sem lançar exceção", async () => {
    const app = buildApp({
      checkDb: async () => {
        throw new Error("connection refused");
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unhealthy" });

    await app.close();
  });
});
