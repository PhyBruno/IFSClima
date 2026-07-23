# F8 · Histórico + Exportação — Design

## Endpoints (backend)

### `GET /api/v1/readings` — listagem paginada
Query (Zod):
- `from`, `to` — ISO 8601 (obrigatórios ou default últimas 24h)
- `page` (default 1), `page_size` (default 50, máx 500)
- `order` = `asc | desc` (default `desc`)

```jsonc
// 200
{
  "from": "2026-07-22T14:30:00.000Z",
  "to":   "2026-07-23T14:30:00.000Z",
  "page": 1, "page_size": 50, "total": 1440,
  "readings": [
    { "timestamp":"2026-07-23T14:30:00.000Z","temperature_c":24.7,"humidity_pct":61.2,
      "pressure_hpa":1013.4,"rain_mm":0.4,"uv_index":5.3 }
  ]
}
```
Query SQL: `WHERE station_id=$1 AND timestamp BETWEEN $from AND $to ORDER BY timestamp {order} LIMIT $size OFFSET ...` + `COUNT(*)` para `total`. Usa índice `(station_id, timestamp DESC)`.

### `GET /api/v1/readings/export` — exportação
Query: `from`, `to` (mesmas regras), `format` = `csv | xlsx`.
- Retorna o **intervalo inteiro** (sem paginação), via **streaming**.
- Headers: `Content-Disposition: attachment; filename="readings_<from>_<to>.<ext>"`, `Content-Type` adequado.
- **CSV:** stream linha a linha (cabeçalho + linhas), separador `,`, timestamp ISO UTC, nulos = vazio.
- **XLSX:** `exceljs` em modo streaming (`WorkbookWriter`), 1 planilha `Leituras`, cabeçalho em negrito, coluna timestamp UTC.

## Camadas

- **Route** (`routes/history.ts`): valida query (Zod), `GET /readings` (JSON) e `GET /readings/export` (stream).
- **Service** (`services/history-service.ts`): `list({from,to,page,page_size,order})`, `exportStream({from,to,format})` → retorna um Readable.
- **Repository:** estende `reading-repository.ts` com `findRange(...)` (paginado + count) e `streamRange(from,to,order)` (cursor/stream do Postgres para não carregar tudo em memória).
- **Exporters:** `exporters/csv.ts`, `exporters/xlsx.ts` — recebem o stream de linhas e produzem o arquivo.

## Frontend — página `/historico`

- **Layout:** header/nav compartilhado com o dashboard (F6); `DateRangePicker` (presets 24h/7d/30d + custom); `ReadingsTable` (paginada); botões "Exportar CSV" / "Exportar XLSX".
- **Data:** React Query `useReadings({from,to,page})`. Export = link/fetch para `/export` com download do blob (respeita `Content-Disposition`).
- **Componentes reusados (F5):** Card, tabela estilizada, botões, EmptyState, StatusPill.
- **Timezone:** tabela formata UTC→local; export mantém UTC.

## Decisões de design

| Tema | Decisão | Razão |
| --- | --- | --- |
| Export server-side + streaming | Endpoint dedicado, `exceljs` WorkbookWriter / CSV stream | Escala p/ intervalos grandes sem estourar memória (HIST-09) |
| Export = intervalo filtrado, não a página | Query usa from/to, ignora paginação | Usuário espera "tudo que filtrei" (HIST-06/07) |
| Coluna de tempo | ISO 8601 UTC no arquivo; local só na UI | Fonte da verdade inequívoca (HIST-08) |
| Limite de intervalo | máx 366 dias → 400 se exceder | Evita export gigante acidental |
| Paginação | offset/limit + count | Dataset de 1 estação é modesto; simples e suficiente |
| Nulos | célula "—" na UI, vazio no arquivo | Clareza vs compatibilidade de planilha |

## Segurança / robustez

- Validação estrita de `from/to/format` (nunca em SQL cru).
- Streaming fecha conexão/cursor no fim ou em erro (sem leak).
- Endpoints públicos (D2), só leitura.

## Reuso

- `reading-repository`, db client, schema (F2/F3/F4).
- Design system e layout/nav (F5/F6).
- Nova dependência backend: `exceljs`.
