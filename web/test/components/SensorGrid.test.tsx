import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import { SensorGrid } from "../../src/components/SensorGrid";
import { LATEST_QUERY_KEY } from "../../src/hooks/useLatest";
import { emptyLatestFixture, latestFixture } from "../fixtures/readings";

/**
 * `SensorGrid` (F6 T6.2/T6.4) — compõe `StatCard` (F5) a partir de
 * `useLatest` (T6.1), com skeleton de loading + banner de reconexão (T6.4).
 * MSW mocka `GET /api/v1/readings/latest`; fixtures sintéticas de
 * `test/fixtures/readings.ts` (mesmas usadas pelos testes de T6.1), sem
 * relação com dados reais da estação.
 */
function createClient(): QueryClient {
  return createQueryClient({ defaultOptions: { queries: { retry: false } } });
}

/**
 * Recebe/cria o `QueryClient` e devolve junto com o resultado de `render` —
 * os testes de T6.4 (erro após sucesso) precisam do MESMO client usado no
 * render para forçar um refetch manual via `client.refetchQueries`, em vez
 * de esperar os 60s reais do polling (`LATEST_POLL_INTERVAL_MS`).
 */
function renderGrid(client: QueryClient = createClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { ...render(<SensorGrid />, { wrapper: Wrapper }), client };
}

describe("SensorGrid", () => {
  it("UI-01: renderiza os 5 cards de sensor com valor e unidade de /latest", async () => {
    renderGrid();

    await waitFor(() => expect(screen.getAllByTestId("statcard")).toHaveLength(5));

    expect(screen.getByText("Temperatura")).toBeInTheDocument();
    expect(screen.getByText("24.7")).toBeInTheDocument();
    expect(screen.getByText("°C")).toBeInTheDocument();

    expect(screen.getByText("Umidade")).toBeInTheDocument();
    expect(screen.getByText("61.2")).toBeInTheDocument();

    expect(screen.getByText("Pressão")).toBeInTheDocument();
    expect(screen.getByText("1013.4")).toBeInTheDocument();

    expect(screen.getByText("Chuva")).toBeInTheDocument();
    expect(screen.getByText("0.4")).toBeInTheDocument();

    expect(screen.getByText("Índice UV")).toBeInTheDocument();
    expect(screen.getByText("5.3")).toBeInTheDocument();
  });

  it("UI-02: sensor com valor null delega ao StatCard (F5) — mostra 'Sem sinal', nunca NaN", async () => {
    server.use(
      http.get("/api/v1/readings/latest", () =>
        HttpResponse.json({ ...latestFixture, rain_mm: null }),
      ),
    );

    renderGrid();

    await waitFor(() => expect(screen.getAllByTestId("statcard")).toHaveLength(5));

    expect(screen.getByText("Sem sinal")).toBeInTheDocument();
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
    // Os demais 4 sensores continuam com dado normal.
    expect(screen.getByText("24.7")).toBeInTheDocument();
  });

  it("UI-03: exibe 'atualizado há X' formatado a partir de age_seconds", async () => {
    server.use(
      http.get("/api/v1/readings/latest", () =>
        HttpResponse.json({ ...latestFixture, age_seconds: 125 }),
      ),
    );

    renderGrid();

    await waitFor(() => expect(screen.getByText(/atualizado/i)).toBeInTheDocument());
    expect(screen.getByText(/atualizado há 2 min/i)).toBeInTheDocument();
  });

  it("UI-04: timestamp null (nenhuma leitura ainda) mostra estado vazio, não os cards/erro", async () => {
    server.use(http.get("/api/v1/readings/latest", () => HttpResponse.json(emptyLatestFixture)));

    renderGrid();

    expect(await screen.findByRole("heading", { name: /nenhuma leitura/i })).toBeInTheDocument();
    expect(screen.queryAllByTestId("statcard")).toHaveLength(0);
  });

  it("T6.4: mostra skeleton durante o carregamento inicial (sem dado em cache ainda) — sem tela em branco", () => {
    renderGrid();

    // Sem `await`/`waitFor` de propósito: MSW resolve de forma assíncrona, e
    // é exatamente o instante síncrono pós-render (antes do fetch resolver)
    // que este teste cobre — `isPending` do React Query, ainda sem `data`.
    expect(screen.getAllByTestId("statcard-skeleton")).toHaveLength(5);
    expect(screen.queryAllByTestId("statcard")).toHaveLength(0);
  });

  it("T6.4/UI-09: grid dos cards é responsivo (2 colunas mobile, 3 no breakpoint md:)", async () => {
    renderGrid();

    await waitFor(() => expect(screen.getAllByTestId("statcard")).toHaveLength(5));

    const grid = screen.getAllByTestId("statcard")[0]!.parentElement!;
    expect(grid).toHaveClass("grid", "grid-cols-2", "md:grid-cols-3");
  });

  it("T6.4/UI-10: erro de rede numa atualização (polling) mantém os cards com o último dado e mostra o banner 'reconectando'", async () => {
    const { client } = renderGrid();
    await waitFor(() => expect(screen.getAllByTestId("statcard")).toHaveLength(5));
    expect(screen.getByText("24.7")).toBeInTheDocument();

    server.use(http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })));
    // Simula o próximo ciclo de polling falhando, sem esperar os 60s reais.
    await client.refetchQueries({ queryKey: LATEST_QUERY_KEY }).catch(() => {});

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByText(/reconectando/i)).toBeInTheDocument();
    // Nunca tela branca: os 5 cards e o valor antigo continuam visíveis.
    expect(screen.getAllByTestId("statcard")).toHaveLength(5);
    expect(screen.getByText("24.7")).toBeInTheDocument();
  });

  it("T6.4/UI-10: falha já na primeira busca (sem dado em cache) mostra o banner, sem quebrar nem inventar cards", async () => {
    server.use(http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })));

    renderGrid();

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByText(/reconectando/i)).toBeInTheDocument();
    expect(screen.queryAllByTestId("statcard")).toHaveLength(0);
    expect(screen.queryAllByTestId("statcard-skeleton")).toHaveLength(0);
  });
});
