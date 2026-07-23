# F1 · Scaffold do monorepo + tooling + Docker Compose — Specification

## Problem Statement

O projeto não existe ainda. Precisamos de um esqueleto de monorepo TypeScript, com tooling de qualidade e ambiente 100% containerizável, para que todas as features seguintes (F2–F7) sejam construídas em TDD sobre uma base consistente e reproduzível.

## Goals

- [ ] `docker compose up` sobe api + web + postgres com um comando, sem setup manual além de `.env`.
- [ ] `npm test` roda a suíte (Vitest) verde em api e web desde o commit inicial.
- [ ] Lint/format/typecheck padronizados e executáveis em ambos os pacotes.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Schema/migrations do banco | É F2 |
| Qualquer endpoint de negócio | É F3/F4 |
| UI real | É F5/F6 |
| CI remoto (GitHub Actions) | Adiado; scripts locais primeiro |

---

## User Stories

### P1: Ambiente containerizado sobe com um comando ⭐ MVP

**User Story**: Como desenvolvedor, quero subir todo o stack com `docker compose up` para desenvolver sem instalar Node/Postgres na máquina.

**Why P1**: Constraint do projeto é 100% containerizável; é a base de tudo.

**Acceptance Criteria**:

1. WHEN executo `docker compose up` THEN o sistema SHALL iniciar os serviços `api`, `web` e `db` (postgres) saudáveis.
2. WHEN o serviço `api` sobe THEN SHALL expor `GET /health` retornando `200 {"status":"ok"}`.
3. WHEN o serviço `db` sobe THEN SHALL ter healthcheck (`pg_isready`) e a `api` SHALL esperar o db estar healthy (`depends_on: condition: service_healthy`).
4. WHEN falta variável de ambiente obrigatória THEN a `api` SHALL falhar no boot com mensagem clara (validação de env com Zod).

**Independent Test**: `docker compose up -d` + `curl localhost:PORT/health` retorna 200.

---

### P1: Tooling de qualidade e testes configurado ⭐ MVP

**User Story**: Como desenvolvedor praticando TDD, quero Vitest, ESLint, Prettier e tsconfig prontos para escrever testes antes do código.

**Why P1**: TDD é constraint; sem harness de teste não há ciclo red-green.

**Acceptance Criteria**:

1. WHEN rodo `npm test` em `api/` e `web/` THEN Vitest SHALL executar e reportar (mesmo que com um teste smoke inicial).
2. WHEN rodo `npm run lint` / `npm run typecheck` THEN SHALL validar sem erros no scaffold.
3. WHEN rodo `npm run test:coverage` THEN SHALL gerar relatório de cobertura com threshold configurado (≥80%).

**Independent Test**: `npm test` verde em ambos os pacotes.

---

## Edge Cases

- WHEN a porta do Postgres já está em uso THEN compose SHALL usar porta configurável via `.env` (não hardcoded).
- WHEN `.env` não existe THEN SHALL haver `.env.example` documentando todas as variáveis.
- WHEN o container `api` reinicia THEN SHALL reconectar ao `db` sem intervenção.

---

## Estrutura de diretórios alvo

```
/
├── api/                 # Fastify + TS
│   ├── src/
│   │   ├── app.ts       # cria a instância Fastify (testável sem subir porta)
│   │   ├── server.ts    # bootstrap (listen)
│   │   ├── config/env.ts# validação de env com Zod
│   │   └── routes/health.ts
│   ├── test/
│   ├── Dockerfile
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   └── package.json
├── web/                 # React + Vite + TS
│   ├── src/
│   ├── Dockerfile
│   ├── vite.config.ts
│   └── package.json
├── db/                  # (F2) migrations/seed
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .dockerignore
└── README.md
```

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| INFRA-01 | P1: Container sobe com um comando | Tasks | Pending |
| INFRA-02 | P1: `/health` responde 200 | Tasks | Pending |
| INFRA-03 | P1: db healthcheck + depends_on | Tasks | Pending |
| INFRA-04 | P1: validação de env (Zod) | Tasks | Pending |
| INFRA-05 | P1: Vitest configurado (api+web) | Tasks | Pending |
| INFRA-06 | P1: lint/format/typecheck | Tasks | Pending |
| INFRA-07 | P1: coverage threshold ≥80% | Tasks | Pending |

---

## Tasks (inline — feature Medium)

> Cada task é executada por um subagent em TDD. Gate = `npm test && npm run lint && npm run typecheck` verde no pacote afetado.

- **T1.1 — Scaffold `api/` (Fastify + TS + Vitest)** `[P]`
  What: `package.json`, `tsconfig`, `vitest.config`, `app.ts` (factory Fastify), ESLint/Prettier.
  Done when: `npm test` roda; teste smoke de `app.ts` (instancia sem erro) passa.
  Subagent: `ecc:tdd-guide` → review `ecc:typescript-reviewer`.

- **T1.2 — Rota `GET /health` + validação de env** (depends: T1.1)
  What: `config/env.ts` (Zod), `routes/health.ts`, registro no app.
  Tests: integração via `light-my-request` — `GET /health` → 200 `{status:"ok"}`; boot falha se env faltando.
  Reuses: `app.ts` de T1.1. Traceability: INFRA-02, INFRA-04.

- **T1.3 — Scaffold `web/` (React + Vite + TS + Vitest/RTL)** `[P]`
  What: Vite React-TS, Vitest + Testing Library, teste smoke de render do `App`.
  Done when: `npm test` e `npm run build` verdes. Traceability: INFRA-05, INFRA-06.

- **T1.4 — Dockerfiles (api, web) + `docker-compose.yml`** (depends: T1.2, T1.3)
  What: Dockerfile multi-stage dev/prod para api e web; compose com `api`, `web`, `db` (postgres:16), healthchecks, `depends_on: service_healthy`, portas via `.env`, `.env.example`, `.dockerignore`.
  Tests: E2E de infra — `docker compose up -d` + `curl /health` 200 (validado em F7 formalmente; smoke aqui).
  Traceability: INFRA-01, INFRA-03.

- **T1.5 — `.gitignore`, `README.md` (como rodar), scripts raiz** (depends: T1.4)
  What: README com quickstart; scripts `test`/`lint`/`typecheck` agregados. Traceability: INFRA-07.

## Success Criteria

- [ ] `docker compose up` → api `/health` 200, web servida, db healthy.
- [ ] `npm test` verde em api e web com coverage threshold ativo.
- [ ] Zero segredos commitados; `.env.example` cobre todas as variáveis.
