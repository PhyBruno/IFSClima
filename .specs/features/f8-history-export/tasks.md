# F8 · Histórico + Exportação — Tasks

> TDD estrito. Subagents: backend `ecc:tdd-guide` + `ecc:database-reviewer` + `ecc:typescript-reviewer`; frontend `ui-ux-pro-max` + `ecc:react-reviewer` + `ecc:a11y-architect`. Gate por task = testes + lint + typecheck (+ build no web) verdes.

## T8.1 — Schemas Zod (query de listagem + export) `[P]`
- **What:** `schemas/history.ts` — validação de `from/to/page/page_size/order` e `format`; regras (from≤to, máx 366d).
- **Depends on:** F2.
- **Tests:** válidos parseiam; from>to → erro; datas inválidas → erro; format inválido → erro.
- **Traceability:** HIST-10.

## T8.2 — Repository: findRange + streamRange
- **What:** estende `reading-repository.ts` com `findRange({from,to,page,size,order})` (linhas + total) e `streamRange(from,to,order)` (cursor/stream).
- **Depends on:** F2, T8.1.
- **Tests (Postgres real):** paginação correta (offset/limit, total); ordenação; intervalo vazio → []; stream emite todas as linhas do intervalo.
- **Traceability:** HIST-01, HIST-02, HIST-09.

## T8.3 — Exporters CSV e XLSX `[P]`
- **What:** `exporters/csv.ts` (stream) e `exporters/xlsx.ts` (`exceljs` WorkbookWriter). Cabeçalho, timestamp UTC, nulos vazios.
- **Depends on:** — (consomem um stream de linhas).
- **Tests:** CSV com cabeçalho + linhas + nulos vazios; XLSX abre e tem as linhas; intervalo vazio → só cabeçalho.
- **Traceability:** HIST-06, HIST-07, HIST-08.

## T8.4 — HistoryService
- **What:** `services/history-service.ts` — `list(...)`, `exportStream({from,to,format})` (liga streamRange ao exporter certo).
- **Depends on:** T8.2, T8.3.
- **Tests:** list mapeia paginação; exportStream escolhe exporter; default últimas 24h.
- **Traceability:** HIST-05.

## T8.5 — Rotas `GET /readings` e `GET /readings/export` (integração)
- **What:** `routes/history.ts` — valida query, JSON paginado, stream com `Content-Disposition`/`Content-Type`, nome de arquivo com intervalo.
- **Depends on:** T8.4.
- **Tests (integração, dados de F3):** listagem paginada; export CSV/XLSX baixa com headers certos; 400 em intervalo/format inválidos; vazio → cabeçalho só.
- **Traceability:** HIST-01..HIST-10.

## T8.6 — Página `/historico` (frontend, TDD/RTL + MSW)
- **What:** `DateRangePicker` (presets + custom), `ReadingsTable` (paginada, célula nula "—", estado vazio), botões de export (download do blob), nav compartilhada com dashboard.
- **Depends on:** T8.5, F5, F6.
- **Tests (RTL+MSW):** filtro dispara fetch; paginação; nulo → "—"; vazio; clique em exportar chama endpoint certo e dispara download.
- **Traceability:** HIST-01..HIST-08.

## T8.7 — Documentação
- **What:** atualizar `docs/` com os endpoints de histórico/export e exemplos.
- **Depends on:** T8.5.

## Ordem
```
T8.1 [P] ┐
T8.3 [P] ┤
T8.2 ────┴→ T8.4 → T8.5 → T8.6 → T8.7
```
