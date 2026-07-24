import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getHistory, type HistoryParams, type HistoryResponse } from "../api-client";

/**
 * `queryKey` de `useHistory` — um valor estável (não `params` inteiro) porque
 * React Query compara chaves por igualdade estrutural profunda; passar cada
 * campo individualmente (mesmo padrão de `seriesQueryKey` em `useSeries.ts`)
 * deixa explícito quais mudanças de filtro disparam uma nova busca.
 */
export function historyQueryKey(params: HistoryParams) {
  return [
    "readings",
    "history",
    params.from ?? null,
    params.to ?? null,
    params.page ?? 1,
    params.pageSize ?? 50,
    params.order ?? "desc",
  ] as const;
}

/**
 * Listagem paginada de leituras brutas (HIST-01, HIST-02, HIST-05). Mesma
 * decisão de `useSeries`: `placeholderData: keepPreviousData` para que trocar
 * de página ou de intervalo mantenha a tabela anterior visível em vez de
 * piscar para um estado vazio/loading (nunca tela branca, mesmo princípio de
 * UI-10 aplicado aqui à página de histórico).
 */
export function useHistory(params: HistoryParams = {}): UseQueryResult<HistoryResponse> {
  return useQuery({
    queryKey: historyQueryKey(params),
    queryFn: () => getHistory(params),
    placeholderData: keepPreviousData,
  });
}

export default useHistory;
