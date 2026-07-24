import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getLatest, type LatestReading } from "../api-client";

export const LATEST_QUERY_KEY = ["readings", "latest"] as const;

/** Polling do `latest` a cada 60s (design.md — "Tempo real": sem websocket no v1, UI-08). */
export const LATEST_POLL_INTERVAL_MS = 60_000;

/**
 * Leitura atual dos 5 sensores, com polling automático. Em erro de rede, o
 * React Query mantém o último `data` bem-sucedido em cache (mesma
 * `queryKey`, sem `keepPreviousData` necessário) — base do banner
 * "reconectando" de T6.4 (nunca tela branca, UI-10).
 */
export function useLatest(): UseQueryResult<LatestReading> {
  return useQuery({
    queryKey: LATEST_QUERY_KEY,
    queryFn: getLatest,
    refetchInterval: LATEST_POLL_INTERVAL_MS,
  });
}
