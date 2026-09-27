import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getUvCriticality, type UvCriticality } from "../utils/uvIndex";

/**
 * Badge de criticidade do Índice UV (escala da OMS, `utils/uvIndex.ts`),
 * exibida no card de UV do `SensorGrid`. Cores fixas nos dois temas — são
 * cores de alerta reconhecidas (verde→roxo), não um acento que acompanha o tema.
 */
const LEVEL_CLASSES: Record<UvCriticality, string> = {
  low: "bg-uv-low/15 text-uv-low",
  moderate: "bg-uv-moderate/15 text-uv-moderate",
  high: "bg-uv-high/15 text-uv-high",
  "very-high": "bg-uv-very-high/15 text-uv-very-high",
  extreme: "bg-uv-extreme/15 text-uv-extreme",
};

export interface UvBadgeProps {
  /** Índice UV bruto da leitura — o componente calcula o nível. */
  value: number;
  className?: string;
}

export function UvBadge({ value, className }: UvBadgeProps) {
  const { level, label } = getUvCriticality(value);

  return (
    <Badge
      data-testid="uv-badge"
      data-level={level}
      className={cn("h-4.5 px-1.5 text-[10px] font-semibold", LEVEL_CLASSES[level], className)}
    >
      {label}
    </Badge>
  );
}

export default UvBadge;
