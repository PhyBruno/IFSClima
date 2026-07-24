import { useLatest } from "../hooks/useLatest";
import { StatusPill } from "../components/StatusPill";
import { SensorGrid } from "../components/SensorGrid";
import { ChartsSection } from "../components/ChartsSection";
import { formatTime } from "../utils/formatTime";

/**
 * `DashboardPage` (F6 T6.5, design.md "Layout") — monta a única tela do
 * produto: header (título + status global) → `SensorGrid` (T6.2/T6.4) →
 * `ChartsSection` (T6.3/T6.4, já embute o `PeriodSelector`). Composição pura
 * — não recria nenhum dos dois, ambos são consumidos como já estão.
 *
 * **Status global no header, não duplicando "atualizado há X".**
 * `SensorGrid` já renderiza sua própria legenda "atualizado há X" (UI-03,
 * T6.2) logo acima do grid de cards — repeti-la aqui, no header, seria o
 * mesmo dado duas vezes na mesma tela. O que falta para fechar design.md
 * ("Header: título · status · atualizado") é o indicador de status GLOBAL
 * (`StatusPill`, variante `inline`, mesmo padrão do header mobile em
 * docs/design-extraction.md §5.4/§5.5) — este componente chama `useLatest()`
 * de novo só para ler esse status; como usa a MESMA `queryKey` do `useLatest`
 * chamado dentro de `SensorGrid` (mesmo `QueryClient`), o React Query dedupa
 * e não dispara uma segunda requisição de rede.
 *
 * **Quando mostrar o pill.** Espelha o gate de `isPending` que `SensorGrid`
 * já usa para o skeleton (T6.4): enquanto a primeira busca está em voo (sem
 * `data` nem erro ainda), não há nada de status para afirmar — o pill só
 * aparece quando a query se resolveu, com sucesso (`online`, mostrando o
 * horário da leitura) ou com erro já na primeira tentativa (`offline`, sem
 * horário). `online = !isError` (não `timestamp !== null`): o pill comunica
 * conectividade com a API, não se já existe alguma leitura — uma estação sem
 * nenhuma leitura ainda (`EmptyState` dentro de `SensorGrid`) está online do
 * mesmo jeito.
 */
export function DashboardPage() {
  const { data, isPending, isError } = useLatest();

  return (
    <main className="min-h-screen bg-surface-page px-4 py-6 text-text-primary md:px-8 md:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold md:text-2xl">Estação Meteorológica</h1>
          {!isPending && (
            <StatusPill
              variant="inline"
              online={!isError}
              lastReadingAt={data?.timestamp ? formatTime(data.timestamp) : undefined}
            />
          )}
        </header>

        <SensorGrid />
        <ChartsSection />
      </div>
    </main>
  );
}

export default DashboardPage;
