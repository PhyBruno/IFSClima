# F4 · API de Leitura — Tasks

> TDD estrito. Subagent `ecc:tdd-guide`; revisão `ecc:typescript-reviewer` + `ecc:database-reviewer` (queries de agregação) + `ecc:security-reviewer` (whitelist de métrica). Gate por task = testes + lint + typecheck verdes.

## T4.1 — Schemas Zod (query + response) `[P]`
- **What:** `schemas/readings.ts` — enum `metric`, enum `range`, schema de response de `latest` e `series`; mapa `metric → coluna` (whitelist).
- **Depends on:** F2.
- **Tests:** query válida parseia; `metric`/`range` inválidos falham; tipos exportados.
- **Traceability:** READ-07.

## T4.2 — Repository: findLatest + aggregate
- **What:** estende `reading-repository.ts` com `findLatest(stationId)` e `aggregate(stationId, metric, interval, bucketUnit)` (usa whitelist, `date_trunc`, avg/min/max e sum p/ rain).
- **Depends on:** F2, T4.1.
- **Tests (Postgres real):** latest pega maior timestamp; aggregate agrupa corretamente por hora/dia; sum de rain; período vazio → [].
- **Traceability:** READ-01, READ-05, READ-06, READ-08, READ-09, READ-10.

## T4.3 — ReadingsService
- **What:** `services/readings-service.ts` — `getLatest()` (calcula `age_seconds`, nulls quando vazio), `getSeries(metric, range)` (mapeia range→interval+bucket).
- **Depends on:** T4.2.
- **Tests:** age_seconds correto; estado vazio retorna nulls; mapeamento range→bucket certo.
- **Traceability:** READ-02, READ-03, READ-04, READ-06.

## T4.4 — Rotas `GET /latest` e `GET /series` (integração)
- **What:** `routes/readings.ts` — valida query, chama service, `Cache-Control: no-store`.
- **Depends on:** T4.3.
- **Tests (integração, dados de F3):** latest após ingestão; series 24h/7d/30d; 400 em metric/range inválidos; 200 buckets:[] sem dados.
- **Done when:** todos ACs verdes; cobertura ≥80%.
- **Traceability:** READ-01..READ-10.

## Ordem
```
T4.1 [P] → T4.2 → T4.3 → T4.4
```
