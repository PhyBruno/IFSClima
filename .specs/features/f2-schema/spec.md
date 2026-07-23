# F2 · Schema do banco + migrations (Drizzle) — Specification

## Problem Statement

As leituras da estação precisam de um lugar confiável para viver. Precisamos do modelo de dados PostgreSQL (via Drizzle ORM) que sustente ingestão idempotente e consultas temporais eficientes (leitura atual + agregações 24h/7d/30d).

## Goals

- [ ] Schema versionado por migrations Drizzle, aplicável em container.
- [ ] Constraint que garante idempotência da ingestão a nível de banco.
- [ ] Índices que tornam as consultas do dashboard eficientes.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Lógica de ingestão | É F3 |
| Endpoints de leitura | É F4 |
| Particionamento/TimescaleDB | Adiado (D4) |

---

## User Stories

### P1: Modelo de leituras com idempotência garantida ⭐ MVP

**User Story**: Como sistema, quero uma tabela `readings` com unicidade por `(station_id, timestamp)` para que reenvios do buffer offline nunca dupliquem.

**Why P1**: Idempotência (D6) é requisito central; deve ser garantida no banco, não só no código.

**Acceptance Criteria**:

1. WHEN insiro duas leituras com mesmo `(station_id, timestamp)` THEN o banco SHALL rejeitar a segunda (unique constraint) — permitindo `ON CONFLICT DO NOTHING`.
2. WHEN uma leitura chega sem algum sensor THEN a coluna correspondente SHALL aceitar `NULL`.
3. WHEN consulto por intervalo de tempo THEN SHALL existir índice em `(station_id, timestamp DESC)`.

**Independent Test**: aplicar migration em db limpo; inserir duplicata → violação de unicidade; inserir com sensores nulos → sucesso.

---

### P2: Estação como entidade (preparação p/ multi-estação)

**User Story**: Como sistema, quero uma tabela `stations` para que `station_id` seja uma FK real, preparando expansão futura sem migração destrutiva (D3).

**Acceptance Criteria**:

1. WHEN o sistema inicializa THEN SHALL haver uma estação seed `main`.
2. WHEN insiro uma leitura THEN `station_id` SHALL referenciar `stations.id`.

---

## Schema alvo (Drizzle)

```
stations
  id            text   PK            -- ex.: "main"
  name          text   NOT NULL
  created_at    timestamptz NOT NULL default now()

readings
  id            bigserial PK
  station_id    text   NOT NULL  FK → stations.id
  timestamp     timestamptz NOT NULL     -- momento da LEITURA (UTC)
  temperature_c real   NULL            -- °C
  humidity_pct  real   NULL            -- %
  pressure_hpa  real   NULL            -- hPa
  rain_mm       real   NULL            -- mm no intervalo
  uv_index      real   NULL            -- índice UV
  received_at   timestamptz NOT NULL default now()  -- quando a API recebeu

  UNIQUE (station_id, timestamp)                     -- idempotência (INGEST)
  INDEX  (station_id, timestamp DESC)                -- consultas temporais
```

> `timestamp` armazenado como `timestamptz` sempre em UTC. Exemplo sintético de valor recebido: `2026-07-23T14:30:00.000Z`. `received_at` distingue "momento da leitura" de "momento do envio" — permite auditar lotes atrasados.

---

## Edge Cases

- WHEN migration roda duas vezes THEN SHALL ser idempotente (Drizzle migrate tracking).
- WHEN `station_id` inexistente é referenciado THEN FK SHALL rejeitar (a ingestão em F3 faz upsert/valida a estação).
- WHEN `timestamp` vem sem timezone THEN camada de app (F3) normaliza p/ UTC antes de persistir.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DB-01 | P1: unique (station_id, timestamp) | Tasks | Done |
| DB-02 | P1: colunas de sensor nullable | Tasks | Done |
| DB-03 | P1: índice (station_id, timestamp DESC) | Tasks | Done |
| DB-04 | P2: tabela stations + seed `main` | Tasks | Done |
| DB-05 | P2: FK readings.station_id → stations.id | Tasks | Done |
| DB-06 | Migrations versionadas + runner em container | Tasks | Done |

---

## Tasks (inline — feature Medium)

> TDD com Postgres real (Testcontainers ou db de teste do compose). Gate = testes de schema/integração verdes.

- **T2.1 — Setup Drizzle (config, conexão, client)** `[P]`
  What: `drizzle.config.ts`, client pg (pool), leitura de `DATABASE_URL` do env validado (F1).
  Done when: conexão testável abre/fecha; teste de conectividade passa.
  Subagent: `ecc:tdd-guide` → review `ecc:database-reviewer`.

- **T2.2 — Definição do schema `stations` + `readings`** (depends: T2.1)
  What: schema Drizzle com colunas, tipos, nullability, unique, índice, FK.
  Tests: teste que valida constraints (insert duplicado falha; sensores nulos ok; FK inválida falha).
  Traceability: DB-01, DB-02, DB-03, DB-05.

- **T2.3 — Migration inicial + seed `main`** (depends: T2.2)
  What: `drizzle-kit generate` migration; script de seed idempotente da estação `main`.
  Tests: aplicar migration em db limpo → schema esperado; re-aplicar → sem erro; seed cria/atualiza `main`.
  Traceability: DB-04, DB-06.

- **T2.4 — Runner de migration em container** (depends: T2.3)
  What: serviço/step no compose (ou entrypoint da api) que roda migrations no boot; documentar `npm run db:migrate`.
  Tests: subir compose limpo → migrations aplicadas automaticamente. Traceability: DB-06.

## Success Criteria

- [ ] Migration aplica em db limpo e é idempotente.
- [ ] Inserção duplicada por `(station_id, timestamp)` é rejeitada pelo banco.
- [ ] Consulta por intervalo usa o índice (verificável via `EXPLAIN`).
