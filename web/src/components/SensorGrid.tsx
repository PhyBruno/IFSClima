import type { ReactNode } from "react";
import { useLatest } from "../hooks/useLatest";
import { StatCard, type SensorType } from "./StatCard";
import { EmptyState } from "./EmptyState";
import { formatAge } from "../utils/formatAge";

/**
 * `SensorGrid` (F6 T6.2) — compõe `StatCard` (F5) para os 5 sensores a
 * partir de `useLatest` (T6.1). Componente isolado, ainda não montado em
 * nenhuma página (isso é T6.5 — `DashboardPage`).
 *
 * Decisões que não estavam 100% determinadas pela task:
 *
 * - **Estado nulo por sensor (AC2)**: `StatCard` já modela `value === null`
 *   como a variante "sem sinal" (DS-04, ver docstring de `StatCard.tsx`,
 *   T5.3a) — mostra "Sem sinal" em vez do valor/unidade, nunca "NaN". Este
 *   componente só repassa `latest[campo]` como veio da API, sem duplicar
 *   nenhuma lógica de "valor ausente" aqui.
 *
 * - **"Atualizado há X" (AC3/UI-03)**: `StatCard.lastSeenText` só é
 *   renderizado no estado offline (ver `StatCard.tsx`) — não existe um lugar
 *   por-card para isso quando o sensor tem dado. Como `age_seconds` é uma
 *   propriedade da *leitura* (uma por estação), não do sensor individual,
 *   o texto é uma legenda única acima do grid, não repetida em cada card.
 *
 * - **Estado vazio global (AC4/UI-04)**: dispara só quando `timestamp` é
 *   explicitamente `null` (nenhuma leitura já registrada) — não enquanto
 *   `data` ainda não chegou (`isLoading`), para não piscar "nenhuma leitura"
 *   durante o carregamento inicial. Skeleton de loading é T6.4, fora deste
 *   escopo; aqui simplesmente não renderiza nada até `data` resolver.
 *
 * - **Ícones**: o inventário real de ícones por sensor não foi extraído em
 *   T5.1/T5.1b (mesma decisão já documentada em `DemoGallery.tsx`, T5.4) —
 *   fora do escopo de T6.2 desenhar um set novo. Reaproveita-se aqui o mesmo
 *   placeholder mínimo (círculo) só para satisfazer a prop obrigatória
 *   `icon` do `StatCard`.
 *
 * - **Grid responsivo**: `repeat(2, 1fr)` com gap `10px` no mobile e
 *   `repeat(3, 1fr)` com gap `16px` no desktop, exatamente como
 *   docs/design-extraction.md §5.9 documenta para o grid de StatCards do
 *   dashboard (`gap-2.5`/`gap-4` = 10px/16px no Tailwind default).
 */

const PLACEHOLDER_ICON: ReactNode = (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={2} />
  </svg>
);

type SensorField = "temperature_c" | "humidity_pct" | "pressure_hpa" | "rain_mm" | "uv_index";

interface SensorDefinition {
  field: SensorField;
  sensor: SensorType;
  label: string;
  unit: string;
}

const SENSORS: SensorDefinition[] = [
  { field: "temperature_c", sensor: "temperature", label: "Temperatura", unit: "°C" },
  { field: "humidity_pct", sensor: "humidity", label: "Umidade", unit: "%" },
  { field: "pressure_hpa", sensor: "pressure", label: "Pressão", unit: "hPa" },
  { field: "rain_mm", sensor: "rain", label: "Chuva", unit: "mm" },
  { field: "uv_index", sensor: "uv", label: "Índice UV", unit: "" },
];

export function SensorGrid() {
  const { data } = useLatest();

  // Ainda carregando/sem resposta: skeleton é T6.4, aqui só evita mostrar o
  // estado vazio incorretamente durante o primeiro fetch.
  if (!data) {
    return null;
  }

  if (data.timestamp === null) {
    return (
      <EmptyState
        title="Nenhuma leitura ainda"
        description="Assim que a estação enviar dados, os sensores aparecem aqui."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text-muted">atualizado {formatAge(data.age_seconds)}</p>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4">
        {SENSORS.map(({ field, sensor, label, unit }) => (
          <StatCard
            key={field}
            sensor={sensor}
            label={label}
            value={data[field]}
            unit={unit}
            icon={PLACEHOLDER_ICON}
          />
        ))}
      </div>
    </div>
  );
}

export default SensorGrid;
