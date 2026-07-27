import { useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { BottomNav } from "../components/BottomNav";
import { DateRangePicker } from "../components/DateRangePicker";
import { ReadingsTable } from "../components/ReadingsTable";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { useHistory } from "../hooks/useHistory";
import { buildExportUrl } from "../api-client";

/** Mesmo `page_size` default do backend (`DEFAULT_PAGE_SIZE`, `api/src/schemas/history.ts`) — não expõe seleção de tamanho de página na UI (fora do escopo de T8.6). */
const DEFAULT_PAGE_SIZE = 50;

/**
 * `HistoryPage` (F8 T8.6, design.md "Frontend — página /historico") — monta
 * a tela `/historico`: `Sidebar`/`BottomNav` (F6, `active="historico"`, ver
 * `main.tsx` para a checagem de pathname que monta este componente) +
 * `DateRangePicker` (F8) + botões de exportar + `ReadingsTable` (F8),
 * ligados por `useHistory` (F8). Mesma composição de layout de
 * `DashboardPage` (Sidebar/BottomNav compartilhados) — não recria nenhum dos
 * dois.
 *
 * **Filtro vive aqui, não em `DateRangePicker`**: `range` (`from`/`to`) e
 * `page` são `useState` desta página — `DateRangePicker` só emite o
 * intervalo calculado (preset ou custom), sem saber nada de paginação;
 * trocar o intervalo sempre volta para a página 1 (um filtro novo invalida
 * a posição de paginação anterior).
 *
 * **Default "últimas 24h" sem inicializar `from`/`to` explicitamente
 * (HIST-05)**: `range` começa `{}` (nenhum dos dois definido) — a MESMA
 * regra de default já vive no backend (`HistoryService.list`, ver
 * `api/src/services/history-service.ts`), então não há necessidade de
 * duplicar "now - 24h" aqui só para o carregamento inicial; o backend
 * resolve e devolve `from`/`to` já concretos em `data.from`/`data.to`, que é
 * o que os botões de export usam (ver abaixo) — mais simples de testar (não
 * depende de mockar `Date` para a primeira renderização).
 *
 * **Export usa o intervalo já resolvido pelo servidor, não o filtro bruto**:
 * `csvUrl`/`xlsxUrl` preferem `data.from`/`data.to` (o intervalo que a
 * tabela está de fato mostrando) sobre `range.from`/`range.to` (que pode
 * estar vazio no carregamento inicial). Isso garante que "Exportar" sempre
 * baixa EXATAMENTE o que está na tela, mesmo antes do usuário escolher um
 * preset — sem isso, um clique em exportar antes de qualquer interação
 * disparia uma segunda resolução de "últimas 24h" no momento do clique,
 * potencialmente alguns segundos depois do "agora" usado pela tabela
 * (HIST-06/HIST-07: "o intervalo filtrado", não um novo intervalo).
 *
 * **Export desabilitado enquanto `data` é placeholder (revisão F8, achado
 * 2)**: `useHistory` usa `placeholderData: keepPreviousData` (F8), então
 * durante o refetch de um intervalo NOVO, `data` ainda é a resposta do
 * intervalo ANTERIOR (React Query mostra o dado velho com
 * `isPlaceholderData: true` enquanto busca o novo) — exportar nessa janela
 * baixaria silenciosamente o intervalo errado. Em vez de arriscar uma URL
 * que o backend re-resolveria de forma diferente do que a tabela mostra
 * (`range` pode estar vazio `{}` no carregamento inicial), os dois links
 * ficam DESABILITADOS (viram `<button disabled>` visualmente idênticos)
 * sempre que não há uma resposta confirmada do intervalo atual
 * (`data === undefined`) ou que a resposta em mãos é só um placeholder
 * (`isPlaceholderData`).
 *
 * **Erro distinto de "vazio" (revisão F8, achado 1)**: `useHistory` também
 * expõe `isError` (React Query) — antes, uma requisição que FALHASSE (ex.
 * `400` de filtro inválido, ou erro de rede) deixava `data === undefined` e
 * `isPending === false`, e a página renderizava `ReadingsTable` com
 * `readings=[]`, mostrando "Nenhum dado no período" (`EmptyState` reusado
 * por `ReadingsTable`) — indistinguível de um intervalo legitimamente vazio.
 * Agora, quando `isError` é `true` (o que só acontece quando a query da
 * chave atual falhou de verdade — `keepPreviousData` só se aplica enquanto
 * o status da query é `"pending"`, nunca `"error"`, então não há "erro com
 * dado antigo ainda visível" a considerar aqui), a página mostra um
 * `EmptyState` com título/descrição de ERRO em vez de montar
 * `ReadingsTable`, reusando o mesmo componente visual (`EmptyState`/`Card`)
 * já usado para o estado vazio em vez de inventar um componente novo — só
 * o texto muda.
 */
export function HistoryPage() {
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [page, setPage] = useState(1);

  const { data, isPending, isError, isPlaceholderData } = useHistory({
    from: range.from,
    to: range.to,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  function handleRangeChange(from: string, to: string) {
    setRange({ from, to });
    setPage(1);
  }

  const readings = data?.readings ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? DEFAULT_PAGE_SIZE;
  const currentPage = data?.page ?? page;

  const exportFrom = data?.from ?? range.from;
  const exportTo = data?.to ?? range.to;
  const csvUrl = buildExportUrl({ from: exportFrom, to: exportTo, format: "csv" });
  const xlsxUrl = buildExportUrl({ from: exportFrom, to: exportTo, format: "xlsx" });

  // Achado 2 (revisão F8): só exporta quando há uma resposta CONFIRMADA do
  // intervalo atual — nem `data === undefined` (nada resolvido ainda/erro),
  // nem `isPlaceholderData` (o `data` em mãos é do intervalo ANTERIOR,
  // mantido visível por `keepPreviousData` enquanto o novo intervalo ainda
  // busca). Ver comentário do arquivo.
  const canExport = data !== undefined && !isPlaceholderData;

  // Achado 1 (revisão F8): `isError` distingue uma requisição que FALHOU
  // (ex. `400` de filtro inválido, erro de rede) de um intervalo que
  // legitimamente não tem dados — sem isso, `showTable` ficava `true` com
  // `readings=[]` e `ReadingsTable` mostrava "Nenhum dado no período" para
  // os dois casos. Erro tem prioridade sobre o `showTable` abaixo.
  const showError = isError;

  // Sem `data` ainda (primeiro carregamento, sem cache): não há readings/total
  // reais para desenhar — evita que `ReadingsTable` mostre por um instante o
  // estado vazio (HIST-04) para um intervalo que na verdade ainda não foi
  // consultado.
  const showTable = !showError && (data !== undefined || !isPending);

  return (
    <div className="flex min-h-screen bg-surface-page text-text-primary">
      <Sidebar active="historico" />

      <main className="flex-1 px-4 pb-32 pt-6 md:pb-8 md:pl-[calc(14rem+2rem)] md:pr-8 md:pt-8">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-xl font-bold md:text-2xl">Histórico</h1>
            <p className="text-sm text-text-tertiary">
              Consulte as leituras brutas de um intervalo e exporte para planilha.
            </p>
          </header>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <DateRangePicker onChange={handleRangeChange} />

            <div className="flex gap-2">
              {canExport ? (
                <a
                  href={csvUrl}
                  download
                  className="rounded-lg border border-border-default bg-surface-card px-3 py-2 text-xs font-semibold text-text-secondary"
                >
                  Exportar CSV
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-border-default bg-surface-card px-3 py-2 text-xs font-semibold text-text-secondary opacity-50 disabled:cursor-not-allowed"
                >
                  Exportar CSV
                </button>
              )}
              {canExport ? (
                <a
                  href={xlsxUrl}
                  download
                  className="rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white"
                >
                  Exportar XLSX
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white opacity-50 disabled:cursor-not-allowed"
                >
                  Exportar XLSX
                </button>
              )}
            </div>
          </div>

          {showError ? (
            <Card>
              <EmptyState
                title="Não foi possível carregar as leituras"
                description="Ajuste o intervalo de datas ou tente novamente mais tarde."
              />
            </Card>
          ) : showTable ? (
            <ReadingsTable
              readings={readings}
              page={currentPage}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
            />
          ) : (
            <p className="text-sm text-text-tertiary">Carregando leituras…</p>
          )}
        </div>
      </main>

      <BottomNav active="historico" />
    </div>
  );
}

export default HistoryPage;
