import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, keepPreviousData, useQuery } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createQueryClient } from "../../src/providers/QueryProvider";
import { seriesQueryKey, useSeries } from "../../src/hooks/useSeries";
import { rainSeriesFixture, seriesFixture } from "../fixtures/readings";

// Mesma estratégia de useLatest.test.tsx: preserva o useQuery real e só
// envolve em vi.fn para inspecionar as options (ex. placeholderData). vi.mock
// é hoisted pelo Vitest para antes destes imports estáticos.
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

describe("useSeries", () => {
  it("resolve com os buckets tipados de /series", async () => {
    const { result } = renderHook(() => useSeries("temperature_c", "24h"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(seriesFixture);
  });

  it("expõe isError quando a API falha", async () => {
    server.use(http.get("/api/v1/readings/series", () => new HttpResponse(null, { status: 500 })));

    const { result } = renderHook(() => useSeries("temperature_c", "24h"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("habilita placeholderData=keepPreviousData (nunca tela branca ao trocar período)", () => {
    renderHook(() => useSeries("temperature_c", "24h"), { wrapper: createWrapper() });

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: seriesQueryKey("temperature_c", "24h"),
        placeholderData: keepPreviousData,
      }),
    );
  });

  it("refetch ao trocar metric/range (queryKey muda)", async () => {
    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ metric, range }: { metric: "temperature_c" | "rain_mm"; range: "24h" }) =>
        useSeries(metric, range),
      {
        wrapper,
        initialProps: { metric: "temperature_c", range: "24h" },
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.metric).toBe("temperature_c");

    server.use(http.get("/api/v1/readings/series", () => HttpResponse.json(rainSeriesFixture)));
    rerender({ metric: "rain_mm", range: "24h" });

    await waitFor(() => expect(result.current.data?.metric).toBe("rain_mm"));
    expect(result.current.data?.buckets[0]?.sum).toBe(0.4);
  });
});
