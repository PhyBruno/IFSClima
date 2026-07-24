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
| D17 | 2026-07-24 | F6 T6.5: header de `DashboardPage` mostra só título + **um único** indicador de status (`StatusPill` inline), visível **só quando a estação está offline** (sem repetir "atualizado há X", que `SensorGrid` já renderiza) | Revisão pelo usuário da primeira versão (que usava `!isError` e sempre mostrava "Online"/"Offline"): "estação offline" agora é definido como sem conexão nas **últimas 24h** (`age_seconds > 86400`) ou nenhuma leitura ainda (`timestamp === null`) — nunca por um erro de fetch pontual (isso continua sendo o `ConnectionBanner` de `SensorGrid`/`ChartsSection`, T6.4, um problema diferente). Nunca mais um texto "Estação online" |
| D18 | 2026-07-24 | F6 T6.5: `Sidebar` (desktop) e `BottomNav` (mobile) — novos componentes de navegação, com "Histórico" (F8) presente mas desabilitado (sem link, F8 ainda não tem página) | Faltavam na primeira versão de T6.5 (feedback do usuário) — `f8-history-export/design.md` já citava "layout/nav compartilhado com o dashboard (F6)" como dependência, confirmando que era escopo de F6. Sem painel de status na sidebar (ver D17: só um indicador, no header) |
| D19 | 2026-07-24 | F8 T8.2: `streamRange` (export CSV/XLSX) implementado como async generator com **keyset pagination** por `(timestamp, id)` em chunks de 1000, não `pg-query-stream`/cursor nativo | Evita nova dependência de driver; paginação por OFFSET grande é evitada (keyset), atendendo HIST-09 (não estourar memória) sem sofisticação desnecessária para o volume de 1 estação |
| D20 | 2026-07-24 | F8 T8.6: página `/historico` roteada por checagem de `window.location.pathname` em `main.tsx` (mesmo padrão já usado por `/__ui`, T5.4), **sem** adicionar `react-router-dom` | Projeto só tem 2 telas reais no total; consistente com a decisão original de T5.4 de não introduzir lib de roteamento até haver necessidade real — item "Histórico" da Sidebar/BottomNav (D18) passa de desabilitado para link real |
| D21 | 2026-07-24 | F7 T7.2: rate limit (`@fastify/rate-limit`) registrado com `global: false`, opt-in só na rota `POST /api/v1/ingest` (via `config.rateLimit` da própria rota) | Estruturalmente impossível de vazar pro polling do dashboard (`/readings/latest` a cada 60s) ou paginação de histórico — só o endpoint mais sensível a abuso (recebe lotes) é limitado |
| D22 | 2026-07-24 | F7 T7.3: proxy `/api/*` do Nginx de produção (`web/nginx.conf`) usa `proxy_pass http://api:3000` **hardcoded**, não um template + `envsubst` parametrizado por env | Porta interna da rede Docker (3000) já é convenção fixa em todo o projeto (compose de dev, `.env.example`, docs) — não é segredo nem varia por ambiente; `envsubst` sobre template adicionaria risco real (substitui também variáveis nativas do Nginx como `$uri`/`$host` se não filtradas) sem benefício |
| D23 | 2026-07-24 | F7 T7.1/T7.2/T7.3: suíte E2E e parte da validação de deploy de produção foram executadas contra um **fallback local** (processos Node + Postgres 16 via apt), não contra `docker compose`/`docker build` reais | Sandbox de implementação bloqueia `docker pull` (mesma limitação já documentada nas "Lessons" abaixo) e, no caso de T7.3, o daemon Docker sequer estava disponível — re-executar a suíte E2E e o build das imagens de produção contra Docker real (outra máquina/CI) antes de considerar F7 validada em produção de verdade |

## Blockers

_(nenhum)_

## Lessons

- `Estacao Meteorologica (standalone).html` é uma página **bundled** (design real dentro de `<script type="__bundler/template">` como JSON + assets base64). Extração do layout deve ser feita por subagent parseando o template, não por leitura direta.
- Paleta observada no design: tema escuro `#0d1117`/`#161b22`/`#1e232b`, bordas `#262c35`, texto `#f3f4f6`/`#9ca3af`; acentos por sensor: laranja `#f97316`, azul `#0ea5e9`, teal `#14b8a6`, roxo `#a855f7`, verde `#16a34a`/`#4ade80`.
- Alguns sandboxes remotos bloqueiam `docker pull` (registry CDN fora da allowlist de rede), o que impede rodar os testes de integração baseados em Testcontainers ali. Nesses casos, validar a lógica apontando temporariamente `test/db/helpers/testPostgres.ts` para um Postgres 16 local (pacote `postgresql-16` do apt) é uma forma de confirmar a suíte antes do commit — desde que o arquivo seja restaurado à versão com Testcontainers antes de commitar (é o que roda em CI/outras máquinas).
- F7: a mesma limitação de `docker pull` bloqueado impediu validar a suíte E2E (T7.1) contra o `docker compose` real, e em pelo menos um sandbox o **daemon Docker nem estava disponível** (T7.3, `docker build`/`docker info` falharam por falta de `/var/run/docker.sock`, não só bloqueio de rede). O fallback usado nos dois casos foi subir `api`/`web` como processos Node locais (`npm run dev`/`node dist/server.js`) contra um Postgres 16 local — válido para provar que a lógica (testes E2E, boot/migrations da imagem de produção) está correta, mas **não substitui** rodar de fato contra Docker real antes de um deploy de produção (ver D23).

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
- [x] Implementar F5 (design system: tokens Tailwind/CSS vars nos dois temas, 7 componentes base testados — Card, StatCard, ChartCard, PeriodSelector, StatusPill, EmptyState, ThemeToggle —, galeria de demo `/__ui`)
- [x] Implementar F6 (dashboard: api-client + React Query, `SensorGrid`, `ChartsSection` com `PeriodSelector`, resiliência/skeletons, `DashboardPage` montada como rota raiz em `App.tsx`)
- [x] Implementar F8 (histórico: `GET /readings` paginado + `GET /readings/export` CSV/XLSX streaming; página `/historico` com `DateRangePicker`, `ReadingsTable`, export)
- [x] Implementar F7 (E2E Playwright do fluxo crítico — validado via fallback local, ver D23 —, logger estruturado + rate limit + helmet + `/health` real, `docker-compose.prod.yml` + proxy `/api` no Nginx de produção, README/docs de operação)

## Deferred Ideas

- Alertas/notificações de valores extremos.
- Múltiplas estações na UI + seletor.
- TimescaleDB para séries em escala.
- Previsão do tempo / integração externa.
- Login/multiusuário.

## Preferences

- Todas as implementações via subagents (pedido do usuário).
- Idioma de comunicação: Português.
