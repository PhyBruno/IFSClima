import {
  keepPreviousData,
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { getSeries, type Metric, type Range, type SeriesResponse } from "../api-client";

export function seriesQueryKey(metric: Metric, range: Range) {
  return ["readings", "series", metric, range] as const;
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
  range: Range,
): UseQueryOptions<SeriesResponse, Error, SeriesResponse, ReturnType<typeof seriesQueryKey>> {
  return {
    queryKey: seriesQueryKey(metric, range),
    queryFn: () => getSeries(metric, range),
    placeholderData: keepPreviousData,
  };
}

/**
 * Histórico agregado de uma métrica/período. `placeholderData: keepPreviousData`
 * (design.md — "Erro de rede"/"Período": trocar `range`/`metric` mantém o
 * gráfico anterior visível enquanto a nova query carrega, em vez de piscar
 * para um estado vazio/loading — nunca tela branca, UI-06/UI-10).
 */
export function useSeries(metric: Metric, range: Range): UseQueryResult<SeriesResponse> {
  return useQuery(seriesQueryOptions(metric, range));
}
