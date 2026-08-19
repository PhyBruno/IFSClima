import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

// Fuso-base da suíte = UTC (achado: DateRangePicker.test.tsx quebrava numa
// máquina com SO em America/Sao_Paulo — os testes cravam ISO strings
// assumindo UTC sem fixar o fuso, ao contrário dos testes que exercitam
// conversão de fuso de propósito e já gerenciam `process.env.TZ` sozinhos,
// restaurando-o depois). Setado aqui, ANTES de qualquer teste rodar, pra
// suíte inteira ficar determinística e não depender do fuso do host.
process.env.TZ = "UTC";

// F6 T6.1: ciclo de vida global do MSW — qualquer teste pode usar
// `server.use(...)` para sobrescrever handlers sem afetar os demais.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
