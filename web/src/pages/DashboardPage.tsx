import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLatest } from "../hooks/useLatest";
import { AppShell } from "../components/AppShell";
import { StatusPill } from "../components/StatusPill";
import { SensorGrid } from "../components/SensorGrid";
import { ChartsSection, getRangeFromSearch } from "../components/ChartsSection";
import { ExportPdfButton } from "../components/ExportPdfButton";
import { formatTime, formatDayMonth } from "../utils/formatTime";
import { formatAge } from "../utils/formatAge";

/**
 * Notificação de offline é uma notificação de ENTRADA na página, não um
 * painel de status permanente (feedback do usuário, 2026-07-27): fica
 * visível por até 60s a partir do carregamento/entrada na página e some
 * sozinha depois disso, mesmo que a estação continue offline — evita o card
 * "grudado" no canto da tela indefinidamente. Reaparece só numa nova
 * entrada/reload (o timer é por montagem do componente, não por reavaliação
 * do estado offline).
 */
const OFFLINE_INDICATOR_VISIBLE_MS = 60_000;

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
 * **"Exportar PDF" (pedido do usuário, 2026-08-16; relatório redesenhado
 * em 2026-09-29)**: o botão gera um RELATÓRIO próprio, não mais um
 * screenshot da tela (`pdf/exportDashboardPdf.ts`: layout claro em A4 com
 * cards, tabela-resumo e gráficos). Os dados vêm do cache do React Query
 * (`queryClient`, os mesmos de `SensorGrid`/`ChartsSection`) para o
 * período ativo em `?range=`. `import()` dinâmico: `html2canvas-pro` e
 * `jsPDF` juntas passam de 150kB minificados, então só quem clica paga o
 * download desse chunk.
 *
 * **Rodapé (feedback do usuário, 2026-07-24; assinatura do desenvolvedor
 * removida a pedido do usuário, 2026-08-16)**: "atualizado há X" morava como
 * legenda dentro do `SensorGrid` (T6.2) — movido pra cá, no rodapé da
 * página. `ageText` reaproveita o MESMO `data`/`useLatest()` já buscado
 * nesta função (sem hook novo) e segue a MESMA regra do `SensorGrid`
 * original: só aparece quando já existe uma leitura de verdade
 * (`data.timestamp !== null`) — nunca "atualizado sem leitura" (texto que só
 * fazia sentido como fallback defensivo de `formatAge`, não como algo a
 * mostrar de propósito).
 */
export function DashboardPage() {
  const { data, isPending } = useLatest();

  const [indicatorTimedOut, setIndicatorTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIndicatorTimedOut(true), OFFLINE_INDICATOR_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  const neverReported = Boolean(data) && data?.timestamp === null;
  const isStale = data?.age_seconds != null && data.age_seconds > STATION_OFFLINE_THRESHOLD_SECONDS;
  const showOfflineIndicator =
    !indicatorTimedOut && !isPending && Boolean(data) && (neverReported || isStale);
  const ageText =
    data && data.timestamp !== null ? `Atualizado ${formatAge(data.age_seconds)}` : null;
  const lastReadingLabel = data?.timestamp
    ? `${formatDayMonth(data.timestamp)} ${formatTime(data.timestamp)}`
    : undefined;

  const queryClient = useQueryClient();

  async function handleExportPdf() {
    const { exportDashboardToPdf } = await import("../pdf/exportDashboardPdf");
    await exportDashboardToPdf({ queryClient, range: getRangeFromSearch(window.location.search) });
  }

  return (
    <AppShell active="dashboard">
      {showOfflineIndicator && (
        <div role="status" aria-live="polite" className="fixed top-4 right-4 z-50">
          <StatusPill variant="card" online={false} lastReadingAt={lastReadingLabel} />
        </div>
      )}

      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
              Painel de Monitoramento
            </h1>
            <p className="text-sm text-muted-foreground">
              Sensores mostram a leitura mais recente da estação; os gráficos mostram a média
              histórica do período selecionado.
            </p>
          </div>
          <ExportPdfButton onExport={handleExportPdf} />
        </header>

        <SensorGrid />
        <ChartsSection />

        <footer className="mt-2 flex flex-col items-center gap-1 border-t pt-4 text-center text-xs text-muted-foreground md:flex-row md:text-left">
          <span>{ageText}</span>
        </footer>
      </div>
    </AppShell>
  );
}

export default DashboardPage;
