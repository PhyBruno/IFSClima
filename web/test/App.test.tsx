import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "../src/App";
import { createQueryClient } from "../src/providers/QueryProvider";

/**
 * `App` (F6 T6.5) agora delega para `DashboardPage`, que consome
 * `useLatest`/`useSeries` — precisa de um `QueryClientProvider` real no
 * teste (testes de composição mais específicos de `DashboardPage` vivem em
 * `test/pages/DashboardPage.test.tsx`; este só garante que a rota raiz monta
 * sem lançar erro e mostra o título).
 */
describe("App", () => {
  it("renderiza sem lançar erro e mostra o título da Estação Meteorológica", () => {
    const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/estação meteorológica/i)).toBeInTheDocument();
  });
});
