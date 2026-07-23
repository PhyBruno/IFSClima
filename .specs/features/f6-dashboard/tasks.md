# F6 · Dashboard — Tasks

> Subagent + `ui-ux-pro-max` (fidelidade), TDD (RTL + MSW). Revisão `ecc:react-reviewer` + `ecc:a11y-architect` + `ecc:performance-optimizer`. Gate = testes + lint + typecheck + build verdes.

## T6.1 — API client tipado + React Query setup `[P]`
- **What:** `api-client.ts` (fetch tipado de `latest`/`series`, tipos de F4), provider React Query, `useLatest`, `useSeries`.
- **Depends on:** F4 (contratos), F1 (web).
- **Tests (MSW):** client parseia respostas; hooks retornam data/loading/error; polling configurado.
- **Traceability:** UI-08, UI-10.

## T6.2 — Cards de sensores (grid)
- **What:** compõe `StatCard` (F5) para os 5 sensores a partir de `useLatest`; "atualizado há X"; estado nulo/vazio.
- **Depends on:** T6.1, F5.
- **Tests (RTL+MSW):** 5 cards preenchem; null → "—"; age formatado; estado vazio global.
- **Traceability:** UI-01, UI-02, UI-03, UI-04.

## T6.3 — Seletor de período + gráficos
- **What:** `PeriodSelector` ligado a `?range=`; `ChartCard` por métrica com Recharts (linha avg + min/max; chuva em barras/sum) via `useSeries`.
- **Depends on:** T6.1, F5.
- **Tests (RTL+MSW):** trocar período refetch; gráfico renderiza buckets; chuva usa sum; período vazio → estado vazio.
- **Traceability:** UI-05, UI-06, UI-07.

## T6.4 — Resiliência, polling e responsividade
- **What:** banner "reconectando" em erro (`keepPreviousData`), skeletons de loading, grid responsivo mobile→desktop, formatação UTC→local.
- **Depends on:** T6.2, T6.3.
- **Tests:** erro de rede mantém último dado + banner; skeleton no loading; layout mobile (viewport).
- **Traceability:** UI-08, UI-09, UI-10.

## T6.5 — Montagem da página + fidelidade visual
- **What:** `DashboardPage` compõe header + cards + seletor + gráficos conforme design; comparação visual com o HTML original.
- **Depends on:** T6.2, T6.3, T6.4.
- **Done when:** fiel ao design; todos ACs verdes; cobertura ≥80%.
- **Traceability:** UI-01..UI-10.

## Ordem
```
T6.1 → T6.2 ┐
        └ T6.3 ┼→ T6.4 → T6.5
```
