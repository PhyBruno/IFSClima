import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import { LATEST_POLL_INTERVAL_MS, LATEST_QUERY_KEY, useLatest } from "../../src/hooks/useLatest";
import { latestFixture } from "../fixtures/readings";

// Preserva a implementação real do useQuery (a wrapper QueryClientProvider
// continua funcionando de ponta a ponta), só envolve em vi.fn para
// conseguirmos inspecionar as options passadas (ex. refetchInterval) sem
// precisar de fake timers avançando 60s de verdade. vi.mock é hoisted pelo
// Vitest para antes destes imports estáticos.
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

describe("useLatest", () => {
  it("começa em loading e resolve com os dados de /latest", async () => {
    const { result } = renderHook(() => useLatest(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(latestFixture);
  });

  it("expõe isError quando a API falha (sem lançar/quebrar o componente)", async () => {
    server.use(http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })));

    const { result } = renderHook(() => useLatest(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("configura polling via refetchInterval de 60s (UI-08)", () => {
    renderHook(() => useLatest(), { wrapper: createWrapper() });

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: LATEST_QUERY_KEY,
        refetchInterval: LATEST_POLL_INTERVAL_MS,
      }),
    );
    expect(LATEST_POLL_INTERVAL_MS).toBe(60_000);
  });
});
