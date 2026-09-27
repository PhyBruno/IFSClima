import type { ReactNode } from "react";
import { CloudRainIcon, DropletsIcon, GaugeIcon, SunIcon, ThermometerIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLatest } from "../hooks/useLatest";
import { StatCard, type SensorType } from "./StatCard";
import { EmptyState } from "./EmptyState";
import { ConnectionBanner } from "./ConnectionBanner";
import { UvBadge } from "./UvBadge";

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
 * - **"Atualizado há X" (AC3/UI-03) — movido pro rodapé da página (revisão,
 *   feedback do usuário, 2026-07-24)**: `StatCard.lastSeenText` só é
 *   renderizado no estado offline (ver `StatCard.tsx`) — não existe um lugar
 *   por-card para isso quando o sensor tem dado. Como `age_seconds` é uma
 *   propriedade da *leitura* (uma por estação), não do sensor individual, a
 *   legenda nunca foi por-card — só que agora vive no `<footer>` de
 *   `DashboardPage` (reaproveitando a MESMA `data` de `useLatest()`, cache
 *   deduplicado pela `queryKey`), não mais aqui. Este componente não sabe
 *   mais nada sobre "idade" da leitura.
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
 *   cache — ver revisão abaixo), não há o que mostrar de real nos cards, mas
 *   também não é um "card" de erro dedicado.
 *
 * - **Revisão (feedback do usuário, 2026-07-24): sem "card" de estação
 *   offline aqui.** A primeira versão desta branch (`!data`) retornava só
 *   `<ConnectionBanner show />` sozinho ocupando o espaço todo — na prática
 *   virou um "card" genérico de erro, mais chamativo que o padrão já usado
 *   em QUALQUER sensor individual sem sinal (§DS-04 acima). Trocado pelos
 *   MESMOS 5 `StatCard` em `value={null}` (variante "sem sinal" que já
 *   existe e já é testada) — mesma malha visual do resto do produto, sem
 *   inventar um segundo padrão de "erro". A ÚNICA comunicação de "estação
 *   offline" do produto é a notificação flutuante de `DashboardPage`
 *   (baseada em `age_seconds`, não em `isError` de uma busca isolada) — essa
 *   branch não tem esse dado (fetch falhou, `data` é `undefined`), então não
 *   tenta mostrar nada a mais além dos cards "sem sinal".
 *
 * - **Ícones**: um ícone lucide por sensor (convenção do shadcn/ui), herdando
 *   o acento via `currentColor` dentro do chip do `StatCard`.
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
 *   `xl:grid-cols-5` (feedback do usuário, 2026-07-24): em telas bem largas
 *   (desktop grande, com a `Sidebar` de T6.5 ocupando 224px fixos à
 *   esquerda), 3 colunas deixavam espaço vazio óbvio à direita — os 5
 *   sensores cabem numa única linha a partir desse breakpoint.
 *
 * - **Badge de criticidade do UV + tooltips (pedido do usuário, 2026-08-16)**:
 *   `UvBadge` só é passada ao card de `uv_index` quando `value !== null`
 *   (criticidade não existe sem um valor pra classificar) — os outros 4
 *   sensores nunca recebem `badge`. `tooltip` (Umidade/UV) é passado nos DOIS
 *   estados (`!data` e normal), inclusive "sem sinal" — é uma explicação do
 *   SENSOR, não do valor da leitura atual.
 */

type SensorField = "temperature_c" | "humidity_pct" | "pressure_hpa" | "rain_mm" | "uv_index";

interface SensorDefinition {
  field: SensorField;
  sensor: SensorType;
  label: string;
  unit: string;
  icon: ReactNode;
  /** Texto de `InfoTooltip` (pedido do usuário, 2026-08-16) — omitido nos sensores sem explicação pedida (Temperatura/Pressão/Chuva). */
  tooltip?: string;
}

/** Explicação do cálculo de umidade relativa (pedido do usuário, 2026-08-16), para o tooltip do card no KPI. */
const HUMIDITY_TOOLTIP =
  "Umidade relativa (%) é a razão entre a quantidade de vapor d'água presente no ar e a quantidade máxima que o ar suportaria na mesma temperatura (ponto de saturação).";

/** Explicação do Índice UV (pedido do usuário, 2026-08-16), para o tooltip do card no KPI — mesma escala usada pela badge de criticidade (`UvBadge`/`utils/uvIndex.ts`). */
const UV_TOOLTIP =
  "Índice UV mede a intensidade da radiação ultravioleta solar na superfície, numa escala de 0 a 11+ definida pela OMS. É calculado a partir da irradiância UV ponderada pela curva de ação eritêmica (sensibilidade da pele humana a cada comprimento de onda) — quanto maior o valor, maior o risco de queimadura em exposição direta.";

const SENSORS: SensorDefinition[] = [
  {
    field: "temperature_c",
    sensor: "temperature",
    label: "Temperatura",
    unit: "°C",
    icon: <ThermometerIcon aria-hidden="true" />,
  },
  {
    field: "humidity_pct",
    sensor: "humidity",
    label: "Umidade",
    unit: "%",
    icon: <DropletsIcon aria-hidden="true" />,
    tooltip: HUMIDITY_TOOLTIP,
  },
  {
    field: "pressure_hpa",
    sensor: "pressure",
    label: "Pressão",
    unit: "hPa",
    icon: <GaugeIcon aria-hidden="true" />,
  },
  {
    field: "rain_mm",
    sensor: "rain",
    label: "Chuva",
    unit: "mm",
    icon: <CloudRainIcon aria-hidden="true" />,
  },
  {
    field: "uv_index",
    sensor: "uv",
    label: "Índice UV",
    unit: "",
    icon: <SunIcon aria-hidden="true" />,
    tooltip: UV_TOOLTIP,
  },
];

/** Mesmo `Card`/espaçamento do `StatCard` real — ocupa o espaço final exato, sem layout shift quando os dados chegam. */
function StatCardSkeleton() {
  return (
    <Card size="sm" data-testid="statcard-skeleton" className="md:[--card-spacing:--spacing(4)]">
      <CardContent className="flex flex-col gap-1.5 md:gap-2.5">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-6 w-1/2 md:h-7" />
      </CardContent>
    </Card>
  );
}

export function SensorGrid() {
  const { data, isPending, isError } = useLatest();

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
          {SENSORS.map(({ field }) => (
            <StatCardSkeleton key={field} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    // Falha já na primeira busca, sem nenhum dado em cache ainda — nunca
    // tela branca (UI-10): os mesmos 5 cards, cada um na variante "sem
    // sinal" do StatCard (não um banner/card de erro dedicado, ver revisão
    // na docstring acima).
    return (
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
        {SENSORS.map(({ field, sensor, label, unit, icon, tooltip }) => (
          <StatCard
            key={field}
            sensor={sensor}
            label={label}
            value={null}
            unit={unit}
            icon={icon}
            tooltip={tooltip}
          />
        ))}
      </div>
    );
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
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
        {SENSORS.map(({ field, sensor, label, unit, icon, tooltip }) => {
          const value = data[field];
          return (
            <StatCard
              key={field}
              sensor={sensor}
              label={label}
              value={value}
              unit={unit}
              icon={icon}
              tooltip={tooltip}
              badge={field === "uv_index" && value !== null ? <UvBadge value={value} /> : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

export default SensorGrid;
