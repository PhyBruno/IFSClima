# F7 · E2E, hardening & deploy — Specification

## Problem Statement

Com backend e frontend prontos, precisamos garantir que o fluxo completo funciona ponta a ponta, que o sistema é observável e seguro o suficiente, e que sobe em produção de forma containerizada e documentada.

## Goals

- [ ] E2E do fluxo crítico: ingestão → persistência → aparece no dashboard.
- [ ] Observabilidade básica (logs estruturados, health) e hardening.
- [ ] Imagens de produção multi-stage + `docker compose` de produção + docs de operação.

## Out of Scope

| Feature | Reason |
| --- | --- |
| CI/CD remoto | Pode ser incremento pós-v1 |
| Orquestração k8s | v2 |
| Alertas/monitoring externo | v2 |

---

## User Stories

### P1: Fluxo ponta a ponta validado ⭐ MVP

**User Story**: Como stakeholder, quero um teste que prove que enviar dados pela API faz o dashboard mostrá-los, para confiar no sistema.

**Acceptance Criteria**:

1. WHEN o E2E envia um lote para `POST /api/v1/ingest` e abre o dashboard THEN os cards SHALL mostrar aqueles valores.
2. WHEN o E2E troca o período THEN os gráficos SHALL refletir os dados ingeridos.
3. WHEN o E2E reenvia o mesmo lote THEN nada SHALL duplicar (idempotência visível).

**Independent Test**: rodar Playwright contra o compose completo → verde.

---

### P1: Deploy containerizado de produção ⭐ MVP

**User Story**: Como operador, quero subir tudo em produção com imagens enxutas e configuração por env.

**Acceptance Criteria**:

1. WHEN construo as imagens THEN SHALL usar multi-stage (build → runtime slim), sem devDependencies no runtime.
2. WHEN subo `docker compose -f docker-compose.prod.yml up` THEN api+web+db SHALL subir com migrations aplicadas.
3. WHEN falta um segredo obrigatório THEN o boot SHALL falhar com erro claro (env validado).

---

### P2: Observabilidade & hardening

**User Story**: Como operador, quero logs úteis e defesas básicas.

**Acceptance Criteria**:

1. WHEN uma requisição chega THEN SHALL haver log estruturado (método, rota, status, latência) sem vazar segredos.
2. WHEN a ingestão recebe abuso THEN SHALL haver rate limiting básico.
3. WHEN respostas são enviadas THEN headers de segurança (helmet) SHALL estar presentes.
4. WHEN `/health` é consultado THEN SHALL refletir conectividade com o banco.

---

## Edge Cases

- WHEN o db cai THEN `/health` retorna unhealthy; api não crasha em loop.
- WHEN a estação manda lote enorme repetidamente THEN rate limit protege.
- WHEN a imagem sobe sem `.env` THEN falha explícita, não silenciosa.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| QA-01 | P1: E2E ingestão→dashboard | Tasks | Pending |
| QA-02 | P1: E2E período/gráficos | Tasks | Pending |
| QA-03 | P1: E2E idempotência visível | Tasks | Pending |
| QA-04 | P1: imagens multi-stage prod | Tasks | Pending |
| QA-05 | P1: compose prod + migrations | Tasks | Pending |
| QA-06 | P2: logs estruturados | Tasks | Pending |
| QA-07 | P2: rate limiting | Tasks | Pending |
| QA-08 | P2: security headers (helmet) | Tasks | Pending |
| QA-09 | P2: /health reflete db | Tasks | Pending |

---

## Tasks (inline — feature Medium)

> E2E via `ecc:e2e-runner`/Playwright. Hardening revisado por `ecc:security-reviewer`. Deploy por `ecc:docker-patterns`.

- **T7.1 — Suíte E2E Playwright (fluxo crítico)** (depends: F3, F6)
  What: sobe compose, ingere lote, valida cards e gráficos, valida idempotência. Artefatos (screenshot/trace) em falha.
  Traceability: QA-01, QA-02, QA-03.

- **T7.2 — Observabilidade + hardening** (depends: F3, F4) `[P]`
  What: logger estruturado (pino), rate limit (`@fastify/rate-limit`) na ingestão, `@fastify/helmet`, `/health` com checagem de db.
  Tests: log não vaza segredo; rate limit retorna 429; headers presentes; health unhealthy sem db.
  Traceability: QA-06, QA-07, QA-08, QA-09.

- **T7.3 — Imagens e compose de produção** (depends: T7.2) `[P]`
  What: Dockerfiles multi-stage (runtime slim), `docker-compose.prod.yml`, migrations no boot, `.env.example` de prod.
  Tests: build das imagens; compose prod sobe com migrations; boot falha sem env.
  Traceability: QA-04, QA-05.

- **T7.4 — Documentação de operação + README final** (depends: T7.1, T7.3)
  What: README (dev + prod), variáveis de ambiente, geração/rotação de `INGEST_API_KEY`, guia do firmware da estação (contrato + retry/buffer).
  Done when: um operador consegue subir do zero seguindo o doc.

## Success Criteria

- [ ] E2E do fluxo crítico verde contra o stack completo.
- [ ] Imagens de produção enxutas; `docker compose` prod sobe com um comando.
- [ ] Logs úteis sem vazamento; rate limit e headers de segurança ativos.
