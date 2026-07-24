import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

// F6 T6.1: ciclo de vida global do MSW — qualquer teste pode usar
// `server.use(...)` para sobrescrever handlers sem afetar os demais.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
