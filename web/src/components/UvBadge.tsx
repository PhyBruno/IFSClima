import { getUvCriticality, type UvCriticality } from "../utils/uvIndex";

/**
 * Badge de criticidade do Índice UV (pedido do usuário, 2026-08-16) — pill
 * colorida com o nível da escala da OMS (`utils/uvIndex.ts`), montada dentro
 * do `StatCard` do sensor UV em `SensorGrid` (ver prop `badge` de
 * `StatCard`). Componente isolado (não inline em `SensorGrid`) para poder
 * ser testado sozinho e reaproveitado por outra tela no futuro (ex. F8).
 */
const LEVEL_CLASSES: Record<UvCriticality, string> = {
  low: "text-uv-low bg-uv-low-bg",
  moderate: "text-uv-moderate bg-uv-moderate-bg",
  high: "text-uv-high bg-uv-high-bg",
  "very-high": "text-uv-very-high bg-uv-very-high-bg",
  extreme: "text-uv-extreme bg-uv-extreme-bg",
};

export interface UvBadgeProps {
  /** Índice UV bruto da leitura — o componente calcula o nível, não recebe um `level` já pronto. */
  value: number;
  className?: string;
}

export function UvBadge({ value, className = "" }: UvBadgeProps) {
  const { level, label } = getUvCriticality(value);

  return (
    <span
      data-testid="uv-badge"
      className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold leading-none ${LEVEL_CLASSES[level]} ${className}`.trim()}
    >
      {label}
    </span>
  );
}

export default UvBadge;
