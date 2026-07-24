import { useLatest } from "../hooks/useLatest";
import { StatusPill } from "../components/StatusPill";
import { Sidebar } from "../components/Sidebar";
import { BottomNav } from "../components/BottomNav";
import { SensorGrid } from "../components/SensorGrid";
import { ChartsSection } from "../components/ChartsSection";
import { formatTime } from "../utils/formatTime";

/**
 * Estação é considerada "offline" só sem conexão nas ÚLTIMAS 24H (regra do
 * usuário, 2026-07-24) — não a cada erro transitório de rede. Uma falha
 * pontual do fetch (`isError`) não basta: `SensorGrid`/`ChartsSection` já
 * comunicam isso sozinhos ("Reconectando…", T6.4/UI-10), um problema
 * DIFERENTE (conectividade do cliente agora) do que este componente decide
 * (a estação em si parou de reportar há muito tempo).
 */
const STATION_OFFLINE_THRESHOLD_SECONDS = 24 * 60 * 60;

/**
 * `DashboardPage` (F6 T6.5, design.md "Layout") — monta a tela do produto:
 * `Sidebar` (desktop)/`BottomNav` (mobile) + header (título + indicador de
 * status) → `SensorGrid` (T6.2/T6.4) → `ChartsSection` (T6.3/T6.4, já embute
 * o `PeriodSelector`). Composição pura — não recria nenhum dos três.
 *
 * **Um único indicador, só quando offline** (feedback do usuário,
 * 2026-07-24, substitui a primeira versão desta tarefa): nunca mostra
 * "Estação online" (o padrão são os cards/gráficos aparecendo normalmente —
 * não precisa de afirmação extra); só aparece quando a estação está offline
 * pela regra de 24h acima. Por isso não fica também um painel de status na
 * `Sidebar` (ver docstring de lá) — duplicaria este mesmo indicador.
 *
 * `data`/`isPending` vêm de `useLatest()` chamado aqui de novo (MESMA
 * `queryKey` de `SensorGrid`, mesmo `QueryClient` — o React Query dedupa,
 * sem requisição de rede extra). Se a busca ainda está em voo (`isPending`,
 * sem `data` nem erro) ou falhou sem nenhum dado em cache (`!data`), não dá
 * pra saber a idade da última leitura — não mostra nada aqui (o caso
 * "!data" já tem seu próprio indicador, o `ConnectionBanner` dentro de
 * `SensorGrid`, evitando um segundo indicador na tela).
 */
export function DashboardPage() {
  const { data, isPending } = useLatest();

  const neverReported = Boolean(data) && data?.timestamp === null;
  const isStale = data?.age_seconds != null && data.age_seconds > STATION_OFFLINE_THRESHOLD_SECONDS;
  const showOfflineIndicator = !isPending && Boolean(data) && (neverReported || isStale);

  return (
    <div className="flex min-h-screen bg-surface-page text-text-primary">
      <Sidebar active="dashboard" />

      <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-8 md:pt-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold md:text-2xl">Estação Meteorológica</h1>
            {showOfflineIndicator && (
              <StatusPill
                variant="inline"
                online={false}
                lastReadingAt={data?.timestamp ? formatTime(data.timestamp) : undefined}
              />
            )}
          </header>

          <SensorGrid />
          <ChartsSection />
        </div>
      </main>

      <BottomNav active="dashboard" />
    </div>
  );
}

export default DashboardPage;
