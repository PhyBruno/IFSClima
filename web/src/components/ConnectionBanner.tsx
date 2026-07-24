import { StatusPill } from "./StatusPill";
import { formatTime } from "../utils/formatTime";

/**
 * `ConnectionBanner` — F6 T6.4 (design.md "Erro de rede": React Query
 * `keepPreviousData` + banner "reconectando", nunca tela branca — UI-10).
 *
 * Componente burro/puro: não sabe nada de React Query. `show` é decidido
 * pelo chamador (`SensorGrid`/`ChartsSection`) a partir do estado de erro
 * dos hooks de dados (T6.1) — tipicamente `isError && data !== undefined`
 * (a query atual falhou, mas ainda há um valor anterior em cache/
 * `placeholderData`, então o usuário nunca vê tela branca).
 *
 * Reaproveita `StatusPill` (F5, variante `inline`, `online={false}`) para o
 * indicador visual "offline" já existente no design system, em vez de
 * inventar um novo padrão de cor/dot — e complementa com o texto explícito
 * "Reconectando…" (StatusPill sozinho não distingue "offline permanente" de
 * "tentando reconectar"; o polling de 60s do `useLatest`/o retry/backoff
 * padrão do React Query são o mecanismo real de retry, este componente só
 * comunica o estado).
 *
 * `role="status"`/`aria-live="polite"`: mudança de conectividade é
 * informação que deve ser anunciada a leitores de tela sem interromper o
 * que o usuário está fazendo (não é `alert`/`assertive` — não é uma falha
 * crítica que bloqueia o uso, os dados antigos continuam visíveis).
 */
export interface ConnectionBannerProps {
  /** true quando a query mais recente falhou mas ainda há dado anterior em cache. */
  show: boolean;
  /** Timestamp ISO UTC da última leitura conhecida (ex. `LatestReading.timestamp`). */
  lastUpdatedAt?: string | null;
  className?: string;
}

export function ConnectionBanner({ show, lastUpdatedAt, className = "" }: ConnectionBannerProps) {
  if (!show) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 rounded-10 border border-status-negative bg-surface-card px-3 py-2 ${className}`.trim()}
    >
      <StatusPill
        variant="inline"
        online={false}
        lastReadingAt={lastUpdatedAt ? formatTime(lastUpdatedAt) : undefined}
      />
      <span className="text-xs text-text-muted">Reconectando…</span>
    </div>
  );
}

export default ConnectionBanner;
