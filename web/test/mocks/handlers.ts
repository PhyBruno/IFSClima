import { http, HttpResponse } from "msw";
import { latestFixture, seriesFixture } from "../fixtures/readings";

/**
 * Handlers default do MSW (F6 T6.1) — mockam os dois endpoints de leitura
 * (F4). Cada teste pode sobrescrever com `server.use(...)` para cenários de
 * erro/estado vazio/rain_mm sem afetar os demais testes (reset em
 * `afterEach`, ver `test/setup.ts`).
 */
export const handlers = [
  http.get("/api/v1/readings/latest", () => HttpResponse.json(latestFixture)),
  http.get("/api/v1/readings/series", () => HttpResponse.json(seriesFixture)),
];
