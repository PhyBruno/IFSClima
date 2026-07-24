import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import { SensorGrid } from "../../src/components/SensorGrid";
import { emptyLatestFixture, latestFixture } from "../fixtures/readings";

/**
 * `SensorGrid` (F6 T6.2) — compõe `StatCard` (F5) a partir de `useLatest`
 * (T6.1). MSW mocka `GET /api/v1/readings/latest`; fixtures sintéticas de
 * `test/fixtures/readings.ts` (mesmas usadas pelos testes de T6.1), sem
 * relação com dados reais da estação.
 */
function createWrapper() {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function renderGrid() {
  return render(<SensorGrid />, { wrapper: createWrapper() });
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
});
