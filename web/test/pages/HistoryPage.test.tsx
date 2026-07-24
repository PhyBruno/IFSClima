import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import { HistoryPage } from "../../src/pages/HistoryPage";
import { emptyHistoryFixture, historyFixture, historyPage2Fixture } from "../fixtures/readings";

/**
 * `HistoryPage` (F8 T8.6) — monta `Sidebar`/`BottomNav` (active="historico")
 * + `DateRangePicker` + `ReadingsTable` + botões de export, ligados por
 * `useHistory`. MSW mocka `GET /api/v1/readings` (handler default em
 * `test/mocks/handlers.ts`, sobrescrito por teste quando necessário).
 */
function renderPage() {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<HistoryPage />, { wrapper: Wrapper });
}

describe("HistoryPage", () => {
  it("exibe o título da página em um heading h1", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: /histórico/i })).toBeInTheDocument();
  });

  it("navegação: Sidebar (desktop) e BottomNav (mobile) presentes, Histórico marcado como página atual", () => {
    renderPage();

    const historicoLinks = screen.getAllByRole("link", { name: /histórico/i });
    expect(historicoLinks).toHaveLength(2); // Sidebar + BottomNav
    historicoLinks.forEach((link) => expect(link).toHaveAttribute("aria-current", "page"));
  });

  it("carrega e lista as leituras do endpoint /readings", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("24.7")).toBeInTheDocument());
    expect(screen.getByText("61.2")).toBeInTheDocument();
  });

  it("HIST-04: intervalo sem dados mostra EmptyState", async () => {
    server.use(http.get("/api/v1/readings", () => HttpResponse.json(emptyHistoryFixture)));

    renderPage();

    expect(
      await screen.findByRole("heading", { name: /nenhum dado no período/i }),
    ).toBeInTheDocument();
  });

  it("botões de exportar apontam para /readings/export com o intervalo resolvido e o format certo", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("24.7")).toBeInTheDocument());

    const csvLink = screen.getByRole("link", { name: /exportar csv/i });
    const xlsxLink = screen.getByRole("link", { name: /exportar xlsx/i });

    expect(csvLink).toHaveAttribute(
      "href",
      `/api/v1/readings/export?from=${encodeURIComponent(historyFixture.from)}&to=${encodeURIComponent(historyFixture.to)}&format=csv`,
    );
    expect(xlsxLink).toHaveAttribute(
      "href",
      `/api/v1/readings/export?from=${encodeURIComponent(historyFixture.from)}&to=${encodeURIComponent(historyFixture.to)}&format=xlsx`,
    );
  });

  it("trocar o filtro de intervalo (DateRangePicker) dispara uma nova busca com o from/to certo", async () => {
    let capturedSearch: URLSearchParams | undefined;
    renderPage();

    await waitFor(() => expect(screen.getByText("24.7")).toBeInTheDocument());

    server.use(
      http.get("/api/v1/readings", ({ request }) => {
        capturedSearch = new URL(request.url).searchParams;
        return HttpResponse.json({ ...historyFixture, from: "2026-07-16T14:30:00.000Z" });
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "7 dias" }));

    await waitFor(() => expect(capturedSearch?.get("from")).toBeTruthy());
    // Reseta para a página 1 ao trocar o filtro.
    expect(capturedSearch?.get("page")).toBe("1");
  });

  it("HIST-02: paginação avança para a próxima página com um novo from/to/page", async () => {
    // `total: 100` (2 páginas com o page_size default de 50) para que
    // "Próxima" comece habilitado — com o `historyFixture` padrão (total: 2)
    // uma única página inteira já cobre tudo, e o botão fica desabilitado.
    server.use(
      http.get("/api/v1/readings", () => HttpResponse.json({ ...historyFixture, total: 100 })),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText("24.7")).toBeInTheDocument());

    let capturedSearch: URLSearchParams | undefined;
    server.use(
      http.get("/api/v1/readings", ({ request }) => {
        capturedSearch = new URL(request.url).searchParams;
        return HttpResponse.json(historyPage2Fixture);
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    await waitFor(() => expect(screen.getByText("20.1")).toBeInTheDocument());
    expect(capturedSearch?.get("page")).toBe("2");
  });
});
