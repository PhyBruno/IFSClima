import type { ReactNode } from "react";
import { useLatest } from "../hooks/useLatest";
import { StatCard, type SensorType } from "./StatCard";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { ConnectionBanner } from "./ConnectionBanner";
import { formatAge } from "../utils/formatAge";

/**
 * `SensorGrid` (F6 T6.2/T6.4) — compõe `StatCard` (F5) para os 5 sensores a
 * partir de `useLatest` (T6.1), com skeleton de loading e banner de
 * reconexão (T6.4). Componente isolado, ainda não montado em nenhuma página
 * (isso é T6.5 — `DashboardPage`).
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
 *   `data` ainda não chegou (`isPending`), para não piscar "nenhuma leitura"
 *   durante o carregamento inicial (esse caso mostra o skeleton, ver T6.4
 *   abaixo).
 *
 * - **Skeleton de loading (T6.4)**: `isPending` do React Query v5 (sem
 *   `data` ainda, primeira busca em andamento) renderiza 5 `StatCardSkeleton`
 *   com a MESMA árvore de classes (`Card`/padding/gap) do `StatCard` real —
 *   evita layout shift quando os dados chegam (spec.md edge case "loading
 *   inicial → skeletons, não layout shift").
 *
 * - **Banner de reconexão (T6.4/UI-10)**: `useLatest` faz polling a cada 60s
 *   (T6.1); se uma atualização falhar, o React Query mantém o `data`
 *   anterior em cache (mesma `queryKey`) e só marca `isError=true` — o
 *   `ConnectionBanner` (F6 T6.4) aparece acima dos cards SEM escondê-los
 *   (nunca tela branca). Se a PRIMEIRA busca falhar (sem `data` nenhum em
 *   cache), não há o que mostrar nos cards — só o banner, sem inventar
 *   valores.
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
 *   dashboard (`gap-2.5`/`gap-4` = 10px/16px no Tailwind default). T6.4
 *   revisou esse valor contra design.md ("mobile 1 coluna; tablet 2") e
 *   manteve a decisão original de T6.2: aquele texto descreve o layout
 *   GERAL da página (a seção de gráficos, que de fato empilha 1→2 colunas,
 *   ver `ChartsSection.tsx`), não o grid específico de StatCards, para o
 *   qual §5.9 já documenta por render real 2/3 colunas — preferir o valor
 *   extraído do design real ao resumo textual genérico do design.md.
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

/** Mesma árvore de classes de `StatCard.tsx` (`Card` padding/gap) — placeholder que ocupa o espaço final exato, sem layout shift quando os dados chegam. */
function StatCardSkeleton() {
  return (
    <Card
      padding="none"
      data-testid="statcard-skeleton"
      className="flex flex-col gap-1.5 p-[11px] md:gap-2.5 md:p-4"
    >
      <Skeleton className="h-9 w-9 rounded-10" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-6 w-1/2 md:h-7" />
    </Card>
  );
}

export function SensorGrid() {
  const { data, isPending, isError } = useLatest();

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4">
          {SENSORS.map(({ field }) => (
            <StatCardSkeleton key={field} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    // Falha já na primeira busca, sem nenhum dado em cache ainda — nunca
    // tela branca (UI-10): só o banner, sem cards (não há valor pra mostrar).
    return <ConnectionBanner show />;
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
      <ConnectionBanner show={isError} lastUpdatedAt={data.timestamp} />
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
