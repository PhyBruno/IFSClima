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

// APIs de navegador que o jsdom não implementa e que os componentes do
// shadcn/ui usam: `matchMedia` (hook `useIsMobile` do Sidebar) e
// `ResizeObserver` (`ResponsiveContainer` do Recharts nos gráficos e o
// Radix). Stubs mínimos — nenhum teste depende do resultado de layout.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// F6 T6.1: ciclo de vida global do MSW — qualquer teste pode usar
// `server.use(...)` para sobrescrever handlers sem afetar os demais.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
