import { http, HttpResponse } from "msw";
import { historyFixture, latestFixture, seriesFixture } from "../fixtures/readings";

/**
 * Handlers default do MSW (F6 T6.1, F8 T8.6) — mockam os endpoints de
 * leitura (F4) e histórico (F8). Cada teste pode sobrescrever com
 * `server.use(...)` para cenários de erro/estado vazio/paginação sem afetar
 * os demais testes (reset em `afterEach`, ver `test/setup.ts`).
 *
 * `/readings/export` não tem handler default: os testes de exportação
 * (`HistoryPage.test.tsx`) só verificam o `href` do link "Exportar
 * CSV"/"Exportar XLSX" — não é preciso simular a resposta do endpoint (o
 * componente nunca faz `fetch` do export, ver `api-client.ts`
 * `buildExportUrl`).
 */
export const handlers = [
  http.get("/api/v1/readings/latest", () => HttpResponse.json(latestFixture)),
  http.get("/api/v1/readings/series", () => HttpResponse.json(seriesFixture)),
  http.get("/api/v1/readings", () => HttpResponse.json(historyFixture)),
];
