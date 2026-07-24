# STATE — Memória do Projeto

Memória persistente: decisões, blockers, lições, todos e ideias adiadas.

## Decisions

| # | Data | Decisão | Razão |
|---|------|---------|-------|
| D1 | 2026-07-23 | Stack: Fastify + React/Vite + Drizzle + PostgreSQL 16, tudo TS, Docker Compose | Leve, testável, ideal p/ TDD; um endpoint de ingestão + leitura não exige framework pesado |
| D2 | 2026-07-23 | Dashboard **público** (sem login) | Escolha do usuário; reduz escopo do v1 |
| D3 | 2026-07-23 | **Estação única**, mas com coluna `station_id` (default `main`) | Escolha do usuário; permite expansão futura sem migração destrutiva |
| D4 | 2026-07-23 | Histórico com **agregação 24h/7d/30d** em Postgres puro (sem TimescaleDB no v1) | Suficiente p/ volume de 1 estação; evita complexidade de infra |
| D5 | 2026-07-23 | Contrato de ingestão em **lote** (`readings[]`) com `timestamp` ISO 8601 UTC por leitura | Estação pode acumular offline e reenviar; timestamp preserva a linha do tempo |
| D6 | 2026-07-23 | Idempotência por `(station_id, timestamp)` | Reenvio do buffer offline não pode duplicar |
| D7 | 2026-07-23 | Auth da ingestão via header `X-API-Key` | Dashboard é público, mas ingestão precisa ser protegida |
| D8 | 2026-07-23 | Sensores individualmente nullable na leitura | Falha de um sensor não invalida a leitura inteira |
| D9 | 2026-07-23 | Sem skill dedicada de Fastify/Drizzle; usar skills existentes + Context7 MCP para docs | skill-scout não encontrou match dedicado; criar skill nova não se justifica |
| D10 | 2026-07-23 | Nova feature F8: página de histórico detalhado (dados brutos, filtro por data, paginação) + exportação CSV/XLSX | Pedido do usuário; dashboard é "relance", histórico é "investigação" |
| D11 | 2026-07-23 | Exportação server-side (endpoint dedicado) do intervalo filtrado inteiro; XLSX via `exceljs` no backend | Robusto, escala melhor que gerar no navegador; independe do cliente |
| D12 | 2026-07-23 | F2: testes de schema/migration usam **Testcontainers** (Postgres 16 efêmero por arquivo de teste), não o `db` do compose | Suíte de testes fica hermética (não depende de `docker compose up` prévio); cada arquivo já parte de um banco limpo |
| D13 | 2026-07-23 | F2: schema/client/migrate/seed Drizzle vivem em `api/src/db/` (mesmo pacote que valida `DATABASE_URL`); só o SQL gerado (`drizzle-kit generate`) fica em `db/migrations/` | `db/` já era reservado para isso desde F1; mantém migrations desacopladas do código da app, mas TS/env ficam onde já são testados/tipados |
| D14 | 2026-07-23 | `createDb` força `timezone=UTC` na sessão Postgres (`pg.Pool({ options: "-c timezone=UTC" })`) | Code review de F4: `date_trunc('day', ...)` do bucket de 30d dependia implicitamente do timezone default do servidor (só "funcionava" pq `postgres:16-alpine` já vem em UTC); agora é explícito e testado (`test/db/client.test.ts`) |
| D15 | 2026-07-23 | Removida a env `API_KEY` (reservada desde F1, nunca usada por nenhuma rota) | Code review de F4: só `INGEST_API_KEY` autentica `POST /api/v1/ingest`; manter as duas confundia operadores. Se surgir necessidade real de uma chave genérica (ex.: auth de admin numa feature futura), reintroduzir com nome específico ao seu uso |
| D16 | 2026-07-23 | F5: tema **claro entra no escopo do v1** (não é mais adiado pra v2); toggle claro/escuro com **escuro como default** | Pedido do usuário durante a execução de F5. O design original já tem os dois temas mockados + um toggle "Modo escuro" — é extração fiel, não design novo. Reabre parte de T5.1 (extração focou só em dark) — ver T5.1b em `f5-design-system/spec.md` |

## Blockers

_(nenhum)_

## Lessons

- `Estacao Meteorologica (standalone).html` é uma página **bundled** (design real dentro de `<script type="__bundler/template">` como JSON + assets base64). Extração do layout deve ser feita por subagent parseando o template, não por leitura direta.
- Paleta observada no design: tema escuro `#0d1117`/`#161b22`/`#1e232b`, bordas `#262c35`, texto `#f3f4f6`/`#9ca3af`; acentos por sensor: laranja `#f97316`, azul `#0ea5e9`, teal `#14b8a6`, roxo `#a855f7`, verde `#16a34a`/`#4ade80`.
- Alguns sandboxes remotos bloqueiam `docker pull` (registry CDN fora da allowlist de rede), o que impede rodar os testes de integração baseados em Testcontainers ali. Nesses casos, validar a lógica apontando temporariamente `test/db/helpers/testPostgres.ts` para um Postgres 16 local (pacote `postgresql-16` do apt) é uma forma de confirmar a suíte antes do commit — desde que o arquivo seja restaurado à versão com Testcontainers antes de commitar (é o que roda em CI/outras máquinas).

## Todos

Fase de PLANEJAMENTO concluída (2026-07-23): todas as specs de F1–F7 escritas em `.specs/features/`. Usuário optou por "planejar tudo primeiro" e revisar antes de implementar.

- [x] Especificar F1 (scaffold + Docker Compose) → `f1-scaffold/spec.md`
- [x] Especificar F2 (schema + migrations) → `f2-schema/spec.md`
- [x] Especificar F3 (endpoint de ingestão) → `f3-ingestion/{spec,design,tasks}.md`
- [x] Especificar F4 (endpoints de leitura) → `f4-read-api/{spec,design,tasks}.md`
- [x] Especificar F5 (extração design system) → `f5-design-system/spec.md`
- [x] Especificar F6 (dashboard) → `f6-dashboard/{spec,design,tasks}.md`
- [x] Especificar F7 (E2E + deploy) → `f7-e2e-deploy/spec.md`

Próxima fase (aguardando OK do usuário para implementar):
- [ ] Implementar F1 (via subagents, TDD)
- [x] Implementar F2 (schema `stations`/`readings` Drizzle, migrations, seed `main`, runner no boot do container)
- [x] Implementar F3 (endpoint `POST /api/v1/ingest`, auth `X-API-Key`, idempotência, rejeição por item)
- [x] Implementar F4 (endpoints `GET /readings/latest` e `GET /readings/series`, agregação `date_trunc` por hora/dia)
- [ ] Implementar F5 → F6 → F7

## Deferred Ideas

- Alertas/notificações de valores extremos.
- Múltiplas estações na UI + seletor.
- TimescaleDB para séries em escala.
- Previsão do tempo / integração externa.
- Login/multiusuário.

## Preferences

- Todas as implementações via subagents (pedido do usuário).
- Idioma de comunicação: Português.
