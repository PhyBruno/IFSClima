# F3 · Ingestão — Tasks

> TDD estrito (red → green → refactor). Cada task por subagent `ecc:tdd-guide`; revisão por `ecc:typescript-reviewer` + `ecc:security-reviewer` (auth) + `ecc:database-reviewer` (repo). Gate por task = `npm test && npm run lint && npm run typecheck` verde.

## T3.1 — Schemas Zod do contrato `[P]`
- **What:** `schemas/ingest.ts` — `Reading`, `IngestRequest`, tipos inferidos, `MAX_BATCH`.
- **Depends on:** F1, F2.
- **Tests:** parse de payload válido; rejeita estrutura errada; `readings` até 5000; `station_id` default `main`.
- **Done when:** testes de schema verdes; tipos exportados.
- **Traceability:** ING-06, ING-08.

## T3.2 — Reading repository (Drizzle) `[P]`
- **What:** `repositories/reading-repository.ts` — interface + impl Drizzle: `ensureStation(id)`, `insertIgnoreConflicts(rows): number`. Chunking.
- **Depends on:** F2.
- **Tests (Postgres real):** insere N novas → retorna N; reinsere → retorna 0; upsert de estação idempotente; chunk de 5000.
- **Done when:** contagem de inseridas correta sob conflito.
- **Traceability:** ING-02, ING-09, DB-01.

## T3.3 — Regras do IngestService
- **What:** `services/ingest-service.ts` — `validateReading()` (faixas físicas + timestamp futuro), normalização UTC, dedupe intra-lote, orquestra repo, monta `{accepted,duplicates,rejected}`.
- **Depends on:** T3.1, T3.2.
- **Tests (fake repo + Postgres):** item fora de faixa → rejected sem derrubar lote; timestamp futuro → rejected; dedupe intra-lote; accepted/duplicates corretos.
- **Done when:** todos os edge cases da spec cobertos.
- **Traceability:** ING-01, ING-03, ING-07, ING-09, ING-10.

## T3.4 — Auth hook `X-API-Key`
- **What:** `plugins/auth-api-key.ts` — preHandler; `timingSafeEqual`; lê `INGEST_API_KEY` do env.
- **Depends on:** F1 (env).
- **Tests:** sem header → 401; header errado → 401; correto → passa; nunca loga a chave.
- **Done when:** revisado por `ecc:security-reviewer`.
- **Traceability:** ING-04, ING-05.

## T3.5 — Rota `POST /api/v1/ingest` (integração)
- **What:** `routes/ingest.ts` — aplica auth hook, parse com limite de body, chama service, mapeia resultado → 202/400/413.
- **Depends on:** T3.3, T3.4.
- **Tests (integração `light-my-request`, Postgres):** fluxo feliz 202; reenvio idempotente; auth 401; estrutura 400; lote grande 413; body não-JSON 400; `readings:[]` → 202 no-op.
- **Done when:** todos os ACs P1/P2 verdes; cobertura ≥80%.
- **Traceability:** ING-01..ING-10.

## T3.6 — Documentação do contrato + exemplo p/ firmware da estação
- **What:** `docs/ingest-api.md` — contrato, exemplos `curl`, política de retry/buffer recomendada para o firmware.
- **Depends on:** T3.5.
- **Done when:** exemplos batem com os testes.

## Ordem
```
T3.1 [P] ┐
T3.2 [P] ┼→ T3.3 → T3.5 → T3.6
T3.4 [P] ┘        ↑
                  (T3.4 também alimenta T3.5)
```
