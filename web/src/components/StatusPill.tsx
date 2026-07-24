import { Card } from "./Card";

export type StatusPillVariant = "card" | "inline";

/**
 * Indicador de status "estação online/offline" — docs/design-extraction.md
 * §5.4 documenta duas variantes visuais:
 * - "card": sidebar desktop — usa `Card` por baixo (surface.card, radius
 *   12px, padding 10px) com dot + texto "Online" + linha secundária opcional
 *   "Última leitura: HH:MM".
 * - "inline": header mobile — sem card, só dot + texto "Estação online" +
 *   horário à direita, mais compacto.
 */
export interface StatusPillProps {
  variant?: StatusPillVariant;
  online: boolean;
  /**
   * Horário da última leitura. Aceita uma string já formatada (ex. "14:32")
   * ou um `Date`, formatado aqui como `HH:MM` local. A extração (§5.4) não
   * define uma regra de tempo relativo ("há X min") para este componente —
   * isso é lógica de apresentação que cabe ao chamador (F6); este componente
   * só exibe o texto/horário que recebe.
   */
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
  className = "",
}: StatusPillProps) {
  const time = lastReadingAt instanceof Date ? formatTime(lastReadingAt) : lastReadingAt;

  // Estado "offline": a extração (§5.4) não modela uma variante offline
  // explícita para ESTE componente (o card dashed do StatCard é outra
  // coisa, ver §5.1). Decisão de API: reaproveitar `status.negative` (cor de
  // alerta já existente no design, usada no delta de baixa) para o dot e o
  // texto principal quando offline, mantendo `text.muted` só na linha
  // secundária de horário — igual ao estado online. Nenhum hex novo.
  const indicatorColorClass = online ? "text-status-online-text" : "text-status-negative";
  const dotColorClass = online ? "bg-status-online-dot" : "bg-status-negative";

  // O dot nunca é a única forma de comunicar o estado: o texto "Online"/
  // "Offline" (ou "Estação online"/"Estação offline") está sempre presente,
  // não depende de cor para quem usa leitor de tela (dot é aria-hidden).
  const dot = (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColorClass}`}
    />
  );

  if (variant === "inline") {
    return (
      <div className={`flex items-center gap-2 ${className}`.trim()}>
        {dot}
        <span className={`text-xs font-medium ${indicatorColorClass}`}>
          {online ? "Estação online" : "Estação offline"}
        </span>
        {time ? <span className="ml-auto text-xs text-text-muted">{time}</span> : null}
      </div>
    );
  }

  return (
    <Card radius="rounded-xl" padding="none" className={`p-2.5 ${className}`.trim()}>
      <div className="flex items-center gap-2">
        {dot}
        <span className={`text-xs font-medium ${indicatorColorClass}`}>
          {online ? "Online" : "Offline"}
        </span>
      </div>
      {time ? <p className="mt-1 text-xs text-text-muted">Última leitura: {time}</p> : null}
    </Card>
  );
}

export default StatusPill;
