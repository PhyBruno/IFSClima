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
 * header (título) + `SensorGrid` (T6.2/T6.4) + `ChartsSection` (T6.3/T6.4),
 * reaproveitando-os tal como estão (nenhum dos três é reaberto aqui). MSW
 * mocka os dois endpoints de F4 com as mesmas fixtures já usadas pelos
 * testes de T6.1-T6.4.
 *
 * **Regra de offline (feedback do usuário, 2026-07-24):** a estação só é
 * "offline" sem conexão nas ÚLTIMAS 24H (`age_seconds > 86400`) ou sem
 * nenhuma leitura ainda (`timestamp === null`) — nunca por um erro
 * transitório de fetch isolado (isso é `ConnectionBanner` dentro de
 * `SensorGrid`/`ChartsSection`, um indicador DIFERENTE, com seu próprio
 * `role="status"`). Só existe UM indicador na tela: uma notificação
 * flutuante no canto superior direito (`StatusPill` variante `card`, texto
 * "Offline" — nunca "Reconectando…", que não existe fora de
 * `ConnectionBanner`).
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

  it("status: leitura recente (< 24h) não mostra nenhuma notificação de offline", async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("statcard")).toHaveLength(5));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });

  it("status: leitura com mais de 24h (age_seconds > 86400) mostra notificação flutuante 'Offline' + horário, sem 'reconectando'", async () => {
    server.use(
      http.get("/api/v1/readings/latest", () =>
        HttpResponse.json({ ...latestFixture, age_seconds: 90_000 }),
      ),
    );

    renderPage();

    const notification = await screen.findByRole("status");
    expect(within(notification).getByText("Offline")).toBeInTheDocument();
    // latestFixture.timestamp = 2026-07-23T14:30:00.000Z, TZ=UTC no teste.
    expect(within(notification).getByText(/última leitura: 14:30/i)).toBeInTheDocument();
    expect(within(notification).queryByText(/reconectando/i)).not.toBeInTheDocument();
  });

  it("status: notificação de offline é flutuante (fixed, canto superior direito), não inline no header", async () => {
    server.use(
      http.get("/api/v1/readings/latest", () =>
        HttpResponse.json({ ...latestFixture, age_seconds: 90_000 }),
      ),
    );

    renderPage();

    const notification = await screen.findByRole("status");
    expect(notification).toHaveClass("fixed", "right-4", "top-4");
    // Não é filho do <header> (que só tem o título).
    const header = screen.getByRole("banner");
    expect(within(header).queryByRole("status")).not.toBeInTheDocument();
  });

  it("status: nenhuma leitura ainda (timestamp null) mostra notificação 'Offline', sem horário", async () => {
    server.use(http.get("/api/v1/readings/latest", () => HttpResponse.json(emptyLatestFixture)));

    renderPage();

    const notification = await screen.findByRole("status");
    expect(within(notification).getByText("Offline")).toBeInTheDocument();
    expect(within(notification).queryByText(/última leitura/i)).not.toBeInTheDocument();
  });

  it("status: erro transitório de fetch (sem dado em cache) NÃO aciona a notificação de offline — quem comunica é o ConnectionBanner de SensorGrid", async () => {
    server.use(http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })));

    renderPage();

    // Só UM indicador na tela: o `ConnectionBanner` de `SensorGrid` (que diz
    // "Reconectando…") — não a notificação de offline baseada em 24h, que
    // não tem dado pra avaliar.
    const status = await screen.findByRole("status");
    expect(within(status).getByText(/reconectando/i)).toBeInTheDocument();
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
