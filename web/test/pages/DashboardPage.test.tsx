import type { ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import { DashboardPage } from "../../src/pages/DashboardPage";
import { emptyLatestFixture, latestFixture } from "../fixtures/readings";

/**
 * `DashboardPage` (F6 T6.5) — monta `Sidebar`/`BottomNav` (navegação) +
 * header (título + indicador de status) + `SensorGrid` (T6.2/T6.4) +
 * `ChartsSection` (T6.3/T6.4), reaproveitando-os tal como estão (nenhum dos
 * três é reaberto aqui). MSW mocka os dois endpoints de F4 com as mesmas
 * fixtures já usadas pelos testes de T6.1-T6.4.
 *
 * **Regra de offline (feedback do usuário, 2026-07-24):** a estação só é
 * "offline" sem conexão nas ÚLTIMAS 24H (`age_seconds > 86400`) ou sem
 * nenhuma leitura ainda (`timestamp === null`) — nunca por um erro
 * transitório de fetch isolado (isso é `ConnectionBanner` dentro de
 * `SensorGrid`/`ChartsSection`, um indicador DIFERENTE). E só existe UM
 * indicador na tela, e só quando offline — nunca um texto "Estação online".
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

  it("navegação: Sidebar (desktop) e BottomNav (mobile) presentes, Dashboard marcado como página atual", () => {
    renderPage();

    const dashboardLinks = screen.getAllByRole("link", { name: /dashboard/i });
    expect(dashboardLinks).toHaveLength(2); // Sidebar + BottomNav
    dashboardLinks.forEach((link) => expect(link).toHaveAttribute("aria-current", "page"));
    // "Histórico" (F8) aparece nos dois, mas desabilitado — nenhum link real.
    expect(screen.queryAllByRole("link", { name: /histórico/i })).toHaveLength(0);
  });

  it("status: leitura recente (< 24h) não mostra nenhum indicador — nunca 'Estação online'", async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("statcard")).toHaveLength(5));
    expect(screen.queryByText(/estação online/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/estação offline/i)).not.toBeInTheDocument();
  });

  it("status: leitura com mais de 24h (age_seconds > 86400) mostra 'Estação offline' + horário no header", async () => {
    server.use(
      http.get("/api/v1/readings/latest", () =>
        HttpResponse.json({ ...latestFixture, age_seconds: 90_000 }),
      ),
    );

    renderPage();

    const header = screen.getByRole("banner");
    await waitFor(() => expect(within(header).getByText(/estação offline/i)).toBeInTheDocument());
    // latestFixture.timestamp = 2026-07-23T14:30:00.000Z, TZ=UTC no teste.
    expect(within(header).getByText("14:30")).toBeInTheDocument();
  });

  it("status: nenhuma leitura ainda (timestamp null) mostra 'Estação offline' no header, sem horário", async () => {
    server.use(http.get("/api/v1/readings/latest", () => HttpResponse.json(emptyLatestFixture)));

    renderPage();

    const header = screen.getByRole("banner");
    await waitFor(() => expect(within(header).getByText(/estação offline/i)).toBeInTheDocument());
    expect(within(header).queryByText(/última leitura/i)).not.toBeInTheDocument();
  });

  it("status: erro transitório de fetch (sem dado em cache) NÃO aciona o indicador do header — quem comunica é o ConnectionBanner de SensorGrid", async () => {
    server.use(http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })));

    renderPage();

    // Só UM indicador na tela: o `ConnectionBanner` de `SensorGrid` (fora do
    // header) — não a regra de 24h do header, que não tem dado pra avaliar.
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    const header = screen.getByRole("banner");
    expect(within(header).queryByText(/estação offline/i)).not.toBeInTheDocument();
  });

  it("mantém o título visível mesmo se /latest e /series falharem (nunca tela branca — UI-10)", async () => {
    server.use(
      http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })),
      http.get("/api/v1/readings/series", () => new HttpResponse(null, { status: 500 })),
    );

    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: /estação meteorológica/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  });

  it("referência: usa a fixture sintética latestFixture (não dados reais da estação)", () => {
    expect(latestFixture.station_id).toBe("main");
  });
});
