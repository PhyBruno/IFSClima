import { useLatest } from "../hooks/useLatest";
import { StatusPill } from "../components/StatusPill";
import { Sidebar } from "../components/Sidebar";
import { BottomNav } from "../components/BottomNav";
import { SensorGrid } from "../components/SensorGrid";
import { ChartsSection } from "../components/ChartsSection";
import { formatTime } from "../utils/formatTime";
import { formatAge } from "../utils/formatAge";

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
 * `Sidebar` (desktop)/`BottomNav` (mobile) + header (só título) →
 * `SensorGrid` (T6.2/T6.4) → `ChartsSection` (T6.3/T6.4, já embute o
 * `PeriodSelector`). Composição pura — não recria nenhum dos três.
 *
 * **Um único indicador, em notificação flutuante, só quando offline**
 * (feedback do usuário, 2026-07-24): nunca mostra "Estação online" (o padrão
 * são os cards/gráficos aparecendo normalmente); só aparece quando a estação
 * está offline pela regra de 24h acima, como um box fixo no canto superior
 * direito (`fixed right-4 top-4`, variante `card` de `StatusPill`) — não
 * inline no header (posição de notificação, não de texto de página). Nunca
 * diz "Reconectando…" (essa palavra só existe em `ConnectionBanner`, um
 * componente diferente): a API é passiva (só recebe o que a estação envia,
 * nunca tenta "conectar" a ela), então não há nada "reconectando" quando a
 * estação para de mandar dado — só o fato de estar offline. Por isso também
 * não fica um painel de status na `Sidebar` (ver docstring de lá) —
 * duplicaria este mesmo indicador.
 *
 * `data`/`isPending` vêm de `useLatest()` chamado aqui de novo (MESMA
 * `queryKey` de `SensorGrid`, mesmo `QueryClient` — o React Query dedupa,
 * sem requisição de rede extra). Se a busca ainda está em voo (`isPending`,
 * sem `data` nem erro) ou falhou sem nenhum dado em cache (`!data`), não dá
 * pra saber a idade da última leitura — não mostra nada aqui (o caso
 * "!data" já tem seu próprio indicador, o `ConnectionBanner` dentro de
 * `SensorGrid`, evitando um segundo indicador na tela).
 *
 * **Título + subtítulo explicativo (feedback do usuário, 2026-07-24)**: "Estação
 * Meteorológica" duplicava o nome da marca já visível no logo da `Sidebar`
 * ("IFSClima") sem agregar informação — trocado por um título funcional
 * ("Painel de Monitoramento"). O subtítulo abaixo existe porque o usuário
 * relatou que não ficava claro que os cards de sensor (`SensorGrid`) são a
 * ÚLTIMA leitura pontual da estação (`useLatest`, um valor só, atualizado por
 * polling a cada 60s — ver `hooks/useLatest.ts`), enquanto os gráficos
 * (`ChartsSection`) são uma AGREGAÇÃO histórica real (`AVG`/`SUM` por
 * hora/dia, calculada no banco — `api/src/services/readings-service.ts`),
 * não os "últimos valores" repetidos. Uma frase só, no topo, cobre as duas
 * fontes de dado de uma vez — não duplicada por seção.
 *
 * **Rodapé (feedback do usuário, 2026-07-24)**: "atualizado há X" morava
 * como legenda dentro do `SensorGrid` (T6.2) — movido pra cá, no rodapé da
 * página, junto da assinatura do desenvolvedor. `ageText` reaproveita o
 * MESMO `data`/`useLatest()` já buscado nesta função (sem hook novo) e segue
 * a MESMA regra do `SensorGrid` original: só aparece quando já existe uma
 * leitura de verdade (`data.timestamp !== null`) — nunca "atualizado sem
 * leitura" (texto que só fazia sentido como fallback defensivo de
 * `formatAge`, não como algo a mostrar de propósito).
 */
export function DashboardPage() {
  const { data, isPending } = useLatest();

  const neverReported = Boolean(data) && data?.timestamp === null;
  const isStale = data?.age_seconds != null && data.age_seconds > STATION_OFFLINE_THRESHOLD_SECONDS;
  const showOfflineIndicator = !isPending && Boolean(data) && (neverReported || isStale);
  const ageText = data && data.timestamp !== null ? `Atualizado ${formatAge(data.age_seconds)}` : null;

  return (
    <div className="flex min-h-screen bg-surface-page text-text-primary">
      <Sidebar active="dashboard" />

      {showOfflineIndicator && (
        <div role="status" aria-live="polite" className="fixed right-4 top-4 z-50">
          <StatusPill
            variant="card"
            online={false}
            lastReadingAt={data?.timestamp ? formatTime(data.timestamp) : undefined}
          />
        </div>
      )}

      {/* pb-32 (128px) no mobile: espaço reservado pro fim da página nunca
          ficar coberto pela `BottomNav` fixa (~48px de altura) — margem
          generosa de sobra, não só o mínimo. Sem padding extra a partir de
          md: (BottomNav some, vira Sidebar). */}
      <main className="flex-1 px-4 pb-32 pt-6 md:px-8 md:pb-8 md:pt-8">
        {/* max-w-5xl (1024px) sobrava espaço vazio óbvio em desktops largos
            (feedback do usuário, 2026-07-24) — 1600px aproveita a largura
            real ao lado da Sidebar sem esticar demais em ultrawide. */}
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-xl font-bold md:text-2xl">Painel de Monitoramento</h1>
            <p className="text-sm text-text-tertiary">
              Sensores mostram a leitura mais recente da estação; os gráficos mostram a média histórica do período
              selecionado.
            </p>
          </header>

          <SensorGrid />
          <ChartsSection />

          <footer className="mt-2 flex flex-col items-center gap-1 border-t border-border-subtle pt-4 text-center text-xs text-text-faint md:flex-row md:justify-between md:text-left">
            <span>{ageText}</span>
            <span>Desenvolvido por Bruno Eduardo Santos © 2026</span>
          </footer>
        </div>
      </main>

      <BottomNav active="dashboard" />
    </div>
  );
}

export default DashboardPage;
