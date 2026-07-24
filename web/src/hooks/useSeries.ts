import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getSeries, type Metric, type Range, type SeriesResponse } from "../api-client";

export function seriesQueryKey(metric: Metric, range: Range) {
  return ["readings", "series", metric, range] as const;
}

/**
 * Histórico agregado de uma métrica/período. `placeholderData: keepPreviousData`
 * (design.md — "Erro de rede"/"Período": trocar `range`/`metric` mantém o
 * gráfico anterior visível enquanto a nova query carrega, em vez de piscar
 * para um estado vazio/loading — nunca tela branca, UI-06/UI-10).
 */
export function useSeries(metric: Metric, range: Range): UseQueryResult<SeriesResponse> {
  return useQuery({
    queryKey: seriesQueryKey(metric, range),
    queryFn: () => getSeries(metric, range),
    placeholderData: keepPreviousData,
  });
}
