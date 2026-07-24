import type { ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import { DashboardPage } from "../../src/pages/DashboardPage";
import { latestFixture } from "../fixtures/readings";

/**
 * `DashboardPage` (F6 T6.5) — monta header (título + status global) +
 * `SensorGrid` (T6.2/T6.4) + `ChartsSection` (T6.3/T6.4), reaproveitando-os
 * tal como estão (nenhum dos dois é reaberto aqui). MSW mocka os dois
 * endpoints de F4 com as mesmas fixtures já usadas pelos testes de T6.1-T6.4.
 */
let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

function renderPage() {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { ...render(<DashboardPage />, { wrapper: Wrapper }), client };
}

describe("DashboardPage", () => {
  it("UI-01: exibe o título da página em um heading h1", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: /estação meteorológica/i })).toBeInTheDocument();
  });

  it("compõe SensorGrid (5 StatCards) e ChartsSection (5 ChartCards + PeriodSelector)", async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("statcard")).toHaveLength(5));
    await waitFor(() => expect(screen.getAllByTestId("chartcard")).toHaveLength(5));
    expect(screen.getByRole("button", { name: "Últimas 24h" })).toBeInTheDocument();
  });

  it("status global: mostra 'Estação online' + horário da última leitura quando /latest responde com sucesso", async () => {
    renderPage();

    const header = screen.getByRole("banner");
    await waitFor(() => expect(within(header).getByText(/estação online/i)).toBeInTheDocument());
    // latestFixture.timestamp = 2026-07-23T14:30:00.000Z, TZ=UTC no teste.
    expect(within(header).getByText("14:30")).toBeInTheDocument();
  });

  it("status global: mostra 'Estação offline' quando /latest falha já na primeira busca (sem dado em cache)", async () => {
    server.use(http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })));

    renderPage();

    // "Estação offline" aparece tanto no pill do header quanto no
    // `ConnectionBanner` de `SensorGrid` (mesmo erro de /latest) — escopado
    // ao `<header>` (role `banner`) para não ser ambíguo.
    const header = screen.getByRole("banner");
    await waitFor(() => expect(within(header).getByText(/estação offline/i)).toBeInTheDocument());
  });

  it("status global: não mostra nenhum indicador durante o carregamento inicial (sem dado em cache ainda)", () => {
    renderPage();

    const header = screen.getByRole("banner");
    expect(within(header).queryByText(/estação online/i)).not.toBeInTheDocument();
    expect(within(header).queryByText(/estação offline/i)).not.toBeInTheDocument();
  });

  it("mantém o título visível mesmo se /latest e /series falharem (nunca tela branca — UI-10)", async () => {
    server.use(
      http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })),
      http.get("/api/v1/readings/series", () => new HttpResponse(null, { status: 500 })),
    );

    renderPage();

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("heading", { level: 1, name: /estação meteorológica/i })).toBeInTheDocument();
    await waitFor(() => expect(within(header).getByText(/estação offline/i)).toBeInTheDocument());
  });

  it("referência: usa a fixture sintética latestFixture (não dados reais da estação)", () => {
    expect(latestFixture.station_id).toBe("main");
  });
});
