import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, keepPreviousData, useQuery } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import { historyQueryKey, useHistory } from "../../src/hooks/useHistory";
import { historyFixture, historyPage2Fixture } from "../fixtures/readings";

// Mesma estratégia de useSeries.test.tsx: preserva o useQuery real e só
// envolve em vi.fn para inspecionar as options (ex. placeholderData).
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: vi.fn(actual.useQuery) };
});

function createWrapper() {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useHistory", () => {
  it("resolve com o payload paginado de /readings", async () => {
    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(historyFixture);
  });

  it("expõe isError quando a API falha", async () => {
    server.use(http.get("/api/v1/readings", () => new HttpResponse(null, { status: 500 })));

    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("habilita placeholderData=keepPreviousData (nunca tela branca ao trocar de página/intervalo)", () => {
    renderHook(() => useHistory({ page: 1 }), { wrapper: createWrapper() });

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: historyQueryKey({ page: 1 }),
        placeholderData: keepPreviousData,
      }),
    );
  });

  it("refetch ao trocar page (queryKey muda)", async () => {
    const wrapper = createWrapper();
    const { result, rerender } = renderHook(({ page }: { page: number }) => useHistory({ page }), {
      wrapper,
      initialProps: { page: 1 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.page).toBe(1);

    server.use(http.get("/api/v1/readings", () => HttpResponse.json(historyPage2Fixture)));
    rerender({ page: 2 });

    await waitFor(() => expect(result.current.data?.page).toBe(2));
    expect(result.current.data?.readings).toHaveLength(1);
  });

  it("envia from/to/pageSize/order recebidos para getHistory (via queryKey estável por parâmetro)", () => {
    const params = {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-23T00:00:00.000Z",
      pageSize: 10,
      order: "asc" as const,
    };
    renderHook(() => useHistory(params), { wrapper: createWrapper() });

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: historyQueryKey(params) }),
    );
  });
});
