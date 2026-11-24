import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchAllReadings, type AllReadingsResult } from "../api-client";

export function rawReadingsQueryKey(from: string | undefined, to: string | undefined) {
  return ["readings", "raw", from ?? null, to ?? null] as const;
}

/**
 * Leituras BRUTAS de `[from, to]` para os gráficos de pontos dos
 * comparativos (decisão do usuário, 2026-11-24: cada ponto é uma leitura
 * real da estação; as linhas continuam sendo as médias por hora/dia).
 *
 * `from`/`to` vêm da janela já resolvida pela API de séries
 * (`SeriesResponse.from/to`), para os pontos cobrirem exatamente o mesmo
 * intervalo das linhas. Sem janela ainda, a query fica desabilitada.
 */
export function useRawReadings(
  from: string | undefined,
  to: string | undefined,
): UseQueryResult<AllReadingsResult> {
  return useQuery({
    queryKey: rawReadingsQueryKey(from, to),
    queryFn: () => fetchAllReadings({ from, to }),
    enabled: from !== undefined && to !== undefined,
    placeholderData: keepPreviousData,
  });
}
