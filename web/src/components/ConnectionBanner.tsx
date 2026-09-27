import { WifiOffIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { formatTime } from "../utils/formatTime";

/**
 * `ConnectionBanner` — aviso de "reconectando" quando a busca mais recente
 * falhou mas ainda há dado anterior em cache (React Query mantém o valor
 * antigo visível, nunca tela branca — UI-10).
 *
 * Componente puro: `show` é decidido pelo chamador (`SensorGrid`/
 * `ChartsSection`). `role="status"`/`aria-live="polite"` porque a perda de
 * conectividade deve ser anunciada sem interromper o usuário — os dados
 * antigos continuam utilizáveis, não é um `alert` crítico.
 */
export interface ConnectionBannerProps {
  /** true quando a query mais recente falhou mas ainda há dado anterior em cache. */
  show: boolean;
  /** Timestamp ISO UTC da última leitura conhecida (ex. `LatestReading.timestamp`). */
  lastUpdatedAt?: string | null;
  className?: string;
}

export function ConnectionBanner({ show, lastUpdatedAt, className }: ConnectionBannerProps) {
  if (!show) {
    return null;
  }

  return (
    <Alert
      role="status"
      aria-live="polite"
      variant="destructive"
      className={cn("border-destructive/40", className)}
    >
      <WifiOffIcon aria-hidden="true" />
      <AlertTitle>Estação offline</AlertTitle>
      <AlertDescription>
        Reconectando…
        {lastUpdatedAt ? ` Última leitura às ${formatTime(lastUpdatedAt)}.` : null}
      </AlertDescription>
    </Alert>
  );
}

export default ConnectionBanner;
