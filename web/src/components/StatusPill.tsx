import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatusPillVariant = "card" | "inline";

/**
 * Indicador "estação online/offline" em duas variantes:
 * - `card`: cartão compacto (usado na notificação flutuante de offline do
 *   `DashboardPage`) com dot + "Online"/"Offline" + "Última leitura: HH:MM".
 * - `inline`: sem cartão, dot + "Estação online/offline" + horário à direita
 *   (usado dentro do `ConnectionBanner`).
 *
 * O dot é decorativo (`aria-hidden`) — o texto sempre comunica o estado, sem
 * depender só de cor.
 */
export interface StatusPillProps {
  variant?: StatusPillVariant;
  online: boolean;
  /** Horário da última leitura: string já formatada ("14:32") ou `Date` (formatado como HH:MM local). */
  lastReadingAt?: string | Date;
  className?: string;
}

function formatTime(value: Date): string {
  const hours = value.getHours().toString().padStart(2, "0");
  const minutes = value.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function StatusPill({
  variant = "card",
  online,
  lastReadingAt,
  className,
}: StatusPillProps) {
  const time = lastReadingAt instanceof Date ? formatTime(lastReadingAt) : lastReadingAt;
  const toneClass = online ? "text-success" : "text-destructive";

  const dot = (
    <span className="relative flex size-2 shrink-0" aria-hidden="true">
      {online ? null : (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60 motion-reduce:animate-none" />
      )}
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          online ? "bg-success" : "bg-destructive",
        )}
      />
    </span>
  );

  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {dot}
        <span className={cn("text-xs font-medium", toneClass)}>
          {online ? "Estação online" : "Estação offline"}
        </span>
        {time ? <span className="ml-auto text-xs text-muted-foreground">{time}</span> : null}
      </div>
    );
  }

  return (
    <Card size="sm" className={cn("gap-1 px-3 shadow-lg", className)}>
      <div className="flex items-center gap-2">
        {dot}
        <span className={cn("text-xs font-medium", toneClass)}>
          {online ? "Online" : "Offline"}
        </span>
      </div>
      {time ? <p className="text-xs text-muted-foreground">Última leitura: {time}</p> : null}
    </Card>
  );
}

export default StatusPill;
