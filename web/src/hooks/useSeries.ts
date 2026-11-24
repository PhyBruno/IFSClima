import {
  keepPreviousData,
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { getSeries, type Metric, type SeriesResponse, type SeriesWindow } from "../api-client";

/** Chave de cache: o preset (`"24h"`…) ou o par `from`/`to` do intervalo personalizado. */
export function seriesQueryKey(metric: Metric, window: SeriesWindow) {
  return [
    "readings",
    "series",
    metric,
    "range" in window ? window.range : `${window.from}/${window.to}`,
  ] as const;
}

/**
 * Options do `useQuery` de uma métrica/período — extraído como função
 * exportada (F6 T6.4) para ser reaproveitado por `ChartsSection.tsx` via
 * `useQueries` (uma query POR métrica, array de tamanho fixo). Chamar
 * `useSeries` uma vez por métrica dentro de um `.map()` violaria as Rules of
 * Hooks (`react-hooks/rules-of-hooks`, `web/.eslintrc.cjs`); `useQueries` é
 * o hook do próprio React Query desenhado pra esse caso ("N queries a partir
 * de um array"), e precisa da MESMA definição de options usada aqui, não uma
 * cópia — daí a extração em vez de duplicar `queryKey`/`queryFn`/
 * `placeholderData` nos dois arquivos.
 */
export function seriesQueryOptions(
  metric: Metric,
  window: SeriesWindow,
): UseQueryOptions<SeriesResponse, Error, SeriesResponse, ReturnType<typeof seriesQueryKey>> {
  return {
    queryKey: seriesQueryKey(metric, window),
    queryFn: () => getSeries(metric, window),
    placeholderData: keepPreviousData,
  };
}

/**
 * Histórico agregado de uma métrica/período. `placeholderData: keepPreviousData`
 * (design.md — "Erro de rede"/"Período": trocar `range`/`metric` mantém o
 * gráfico anterior visível enquanto a nova query carrega, em vez de piscar
 * para um estado vazio/loading — nunca tela branca, UI-06/UI-10).
 */
export function useSeries(metric: Metric, window: SeriesWindow): UseQueryResult<SeriesResponse> {
  return useQuery(seriesQueryOptions(metric, window));
}
