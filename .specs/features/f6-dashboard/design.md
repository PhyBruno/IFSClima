# F6 · Dashboard — Design

## Layout (fiel ao design bundled)

```
┌────────────────────────────────────────────────────────┐
│  Header: "Estação Meteorológica" · status · atualizado  │
├────────────────────────────────────────────────────────┤
│  [Temp]  [Umidade]  [Pressão]  [Chuva]  [UV]   ← StatCards (grid responsivo)
├────────────────────────────────────────────────────────┤
│  PeriodSelector:  ( 24h ) ( 7d ) ( 30d )                │
├────────────────────────────────────────────────────────┤
│  ChartCard Temperatura        ChartCard Umidade         │
│  ChartCard Pressão            ChartCard Chuva (barras)  │
│  ChartCard UV                                           │
└────────────────────────────────────────────────────────┘
```
Grid: mobile 1 coluna; tablet 2; desktop conforme design. Tema escuro (F5).

## Arquitetura frontend

- **Data layer:** `api-client.ts` (fetch tipado das rotas F4) + React Query (cache, polling, retry/backoff, estados loading/error).
- **Hooks:** `useLatest()` (polling 60s), `useSeries(metric, range)`.
- **State:** período selecionado em estado local (ou URL query `?range=`), compartilhado pelos gráficos.
- **Componentes:** reusa F5 (`StatCard`, `ChartCard`, `PeriodSelector`, `EmptyState`, `StatusPill`).
- **Charts:** Recharts dentro de `ChartCard`; linha (avg) + banda min/max opcional; chuva = barras (sum).
- **Formatação:** util `formatValue(metric, value)` e `formatTime(utc, tz)` (UTC→local).

## Contratos consumidos (F4)

- `GET /api/v1/readings/latest` → cards.
- `GET /api/v1/readings/series?metric=&range=` → gráficos.

Exemplo (latest):
```json
{ "station_id":"main","timestamp":"2026-07-23T14:30:00.000Z","age_seconds":42,
  "temperature_c":24.7,"humidity_pct":61.2,"pressure_hpa":1013.4,"rain_mm":0.4,"uv_index":5.3 }
```

## Decisões de design

| Tema | Decisão | Razão |
| --- | --- | --- |
| Tempo real | Polling 60s via React Query (sem websocket no v1) | Simplicidade; leituras são de minuto |
| Erro de rede | React Query `keepPreviousData` + banner "reconectando" | Nunca tela branca (UI-10) |
| Chuva | gráfico de barras com `sum` | Precipitação é acumulada (UI-07) |
| Período | fonte única (URL `?range=`), default 24h | Compartilhável; recarrega todos os gráficos (UI-06) |
| Testes | RTL + MSW (mock da API) | Testar UI sem backend real; integração real em F7/E2E |
| Timezone | formatar no cliente a partir de UTC | Servidor agnóstico (F4) |

## Testes

- **Componente/integração (RTL + MSW):** cards preenchem de `latest`; estado nulo/vazio; troca de período dispara refetch; erro de rede mostra banner; loading = skeleton.
- **A11y:** roles, labels, contraste, navegação por teclado no PeriodSelector.

## Reuso

- F5 (design system, componentes, tokens).
- F4 (contratos de API).
