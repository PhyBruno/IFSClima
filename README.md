# Estação Meteorológica (IFSClima)

Plataforma web que recebe, armazena e visualiza os dados de uma estação meteorológica in loco (temperatura, umidade, pressão, chuva, UV) em tempo real e em histórico.

> **Status: F1–F8 completas.** Todas as features do roadmap (`.specs/project/ROADMAP.md`) estão implementadas nesta branch — da ingestão ao deploy de produção. Resumo por feature:
>
> - **F1 — Scaffold**: monorepo `api/` + `web/` + `db/`, TypeScript, ESLint/Prettier, Vitest, Docker Compose.
> - **F2 — Schema/migrations**: tabelas `stations`/`readings` (Drizzle), constraint `(station_id, timestamp)` para idempotência.
> - **F3 — Ingestão** (`POST /api/v1/ingest`): único endpoint de entrada de dados, auth `X-API-Key`, validação Zod, lote idempotente — ver `docs/ingest-api.md`.
> - **F4 — API de leitura**: `GET /api/v1/readings/latest` e `GET /api/v1/readings/series` (séries agregadas por hora/dia), consumidas pelo dashboard.
> - **F5 — Design system**: tokens (cores/tipografia/espaçamento) extraídos do design original, temas claro/escuro, componentes base (galeria em `/__ui`) — ver `docs/design-extraction.md`.
> - **F6 — Dashboard**: página única responsiva com cards por sensor + gráficos por período (24h/7d/30d).
> - **F7 — E2E, hardening & deploy**: suíte E2E Playwright, observabilidade (logs estruturados, `/health` real), rate limiting, imagens Docker de produção multi-stage — **esta seção do README**.
> - **F8 — Histórico + exportação**: `GET /api/v1/readings` (paginado) e `/readings/export` (CSV/XLSX streaming), página `/historico` — ver `docs/history-api.md`.

## Stack

| Camada | Tecnologia |
| --- | --- |
| API | Fastify + Node.js 20 LTS + TypeScript |
| Web | React 18 + Vite + TypeScript + Tailwind CSS |
| Banco | PostgreSQL 16 |
| Testes | Vitest (+ light-my-request na api, Testing Library na web) + Playwright (E2E, `e2e/`) |
| Containers | Docker + Docker Compose (dev e produção, composes separados) |

## Estrutura

```
/
├── api/                 # Fastify + TS (porta padrão 3000)
│   ├── src/
│   │   ├── app.ts       # factory Fastify (testável sem subir porta)
│   │   ├── server.ts    # bootstrap (valida env, roda migrations/seed, sobe o listen)
│   │   ├── config/      # env.ts (validação Zod) e logger.ts (F7: logger estruturado, redact de segredos)
│   │   ├── db/          # schema Drizzle, client pg, migrate.ts, seed.ts
│   │   ├── schemas/     # contratos Zod (ingest.ts, readings.ts, history.ts)
│   │   ├── repositories/# ReadingRepository (Drizzle)
│   │   ├── services/    # regras de negócio (ingest, readings, history)
│   │   ├── exporters/   # F8: geração de CSV/XLSX em streaming
│   │   ├── plugins/     # auth-api-key.ts (X-API-Key, tempo-constante)
│   │   └── routes/      # health.ts, ingest.ts, readings.ts, history.ts
│   ├── test/
│   ├── drizzle.config.ts
│   └── Dockerfile       # multi-stage: dev | build | prod-deps | runtime
├── web/                 # React + Vite + TS (porta padrão 5173)
│   ├── src/
│   ├── test/
│   ├── nginx.conf       # F7: proxy /api/* -> api, usado só pelo stage `runtime`
│   └── Dockerfile       # multi-stage: dev | build | runtime
├── e2e/                 # F7: suíte E2E Playwright — ver e2e/README.md
├── db/                  # migrations SQL geradas (drizzle-kit) — ver db/README.md
│   └── migrations/
├── docs/
│   ├── ingest-api.md         # contrato completo de POST /api/v1/ingest
│   ├── history-api.md        # contrato de GET /readings e /readings/export
│   └── design-extraction.md  # design system (tokens/componentes)
├── docker-compose.yml         # dev (bind mount de código, hot reload)
├── docker-compose.prod.yml    # produção (imagens runtime, sem bind mount)
├── .env.example                # env de dev
├── .env.prod.example            # env de produção
└── package.json         # scripts agregados (test/lint/typecheck/build/db:*/test:e2e)
```

## Quickstart (Docker — recomendado)

Pré-requisitos: Docker + Docker Compose. Nenhuma instalação de Node/Postgres na máquina é necessária.

```bash
cp .env.example .env
# edite .env se quiser trocar portas/senha local

docker compose up -d
curl http://localhost:3000/health   # -> {"status":"ok"}

# ingestão de leituras (contrato completo em docs/ingest-api.md)
curl -i -X POST http://localhost:3000/api/v1/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: whs_test_ABC123" \
  -d '{"readings":[{"timestamp":"2026-07-23T14:30:00.000Z","temperature_c":24.7}]}'
# -> 202 {"accepted":1,"duplicates":0,"rejected":[]}

# web (dashboard): http://localhost:5173
# web (histórico + export): http://localhost:5173/historico
```

Os serviços sobem nesta ordem, aguardando saúde uns dos outros:

1. `db` (postgres:16) — healthcheck via `pg_isready`.
2. `api` — só inicia após `db` estar `healthy` (`depends_on: condition: service_healthy`); expõe `GET /health`.
3. `web` — só inicia após `api` estar `healthy`.

Se faltar uma variável obrigatória (`DATABASE_URL` ou `INGEST_API_KEY`), a `api` falha o boot com uma mensagem clara listando o campo e o motivo (validação Zod em `src/config/env.ts`).

No boot, a `api` também roda as **migrations Drizzle** (`db/migrations/`) e o **seed** da estação `main` automaticamente, antes de aceitar tráfego (idempotente — seguro em todo restart). Veja `db/README.md` para o schema completo.

Para parar e remover os containers: `docker compose down` (adicione `-v` para também apagar o volume de dados do Postgres).

## Quickstart (sem Docker — desenvolvimento local)

Requer Node.js 20+.

```bash
npm run install:all      # instala api/, web/ e e2e/

# em dois terminais:
npm run dev:api           # http://localhost:3000 (requer .env — veja abaixo)
npm run dev:web            # http://localhost:5173
```

A api local também valida env via Zod; exporte pelo menos `DATABASE_URL` e `INGEST_API_KEY` (veja `.env.example`) antes de `npm run dev:api`.

## Deploy de produção

Produção usa um **compose separado** do de dev, `docker-compose.prod.yml`, e seu próprio arquivo de env, `.env.prod.example`:

```bash
cp .env.prod.example .env.prod
# edite .env.prod: troque POSTGRES_PASSWORD e INGEST_API_KEY por segredos
# reais e fortes (veja a seção "Gerando e rotacionando o INGEST_API_KEY"
# abaixo) — nunca use os valores de exemplo (sintéticos) em produção real.

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
curl http://localhost:3000/health   # -> {"status":"ok"}

# web (Nginx servindo o build de produção): http://localhost:8080
# (ou a porta que você configurou em WEB_PORT no .env.prod)
```

Diferenças-chave em relação ao `docker-compose.yml` de dev:

- **Imagens `runtime` enxutas** (stage final do Dockerfile multi-stage de `api/` e `web/`): a `api` roda com `node dist/server.js` e só `node_modules` de produção (`npm ci --omit=dev`, sem devDependencies); a `web` é servida por Nginx a partir dos assets já buildados (`web/nginx.conf`, que também faz proxy de `/api/*` para o serviço `api` na rede Docker).
- **Sem bind mount de código-fonte**: dev monta `./api:/app`, `./web:/app` e `./db/migrations:/db/migrations` para hot reload; produção não monta nada do host — tudo já está copiado dentro da imagem no build. Um `docker compose ... up -d --build` é necessário sempre que o código mudar (não há reload automático).
- **`NODE_ENV=production` fixo** no compose (não configurável por env, ao contrário de `NODE_ENV=${NODE_ENV:-development}` no compose de dev) — evita subir produção acidentalmente em modo dev.
- **`API_TARGET`/`WEB_TARGET` não existem** no `.env.prod.example`: o stage é sempre `runtime`, fixo no `docker-compose.prod.yml`.
- **Porta da web**: em dev, `WEB_PORT` (default `5173`) aponta pro dev server do Vite; em produção, `WEB_PORT` (default `8080` no `.env.prod.example`) é mapeada para a porta `80` do Nginx dentro do container — ajuste para `80` se este host for dedicado ao IFSClima com um reverse proxy/TLS na frente.

Comportamento de boot é o mesmo de dev: a `api` roda **migrations + seed da estação `main` automaticamente** antes de aceitar tráfego (idempotente, seguro em todo restart/redeploy), e **falha o boot com erro explícito** se faltar `DATABASE_URL`/`INGEST_API_KEY` (nunca sobe silenciosamente maldeconfigurada).

Para parar: `docker compose -f docker-compose.prod.yml --env-file .env.prod down` (adicione `-v` para também apagar o volume de dados do Postgres — cuidado, isso é destrutivo em produção).

## Scripts agregados (raiz)

```bash
npm test             # roda Vitest em api/ e web/ (unitário/integração)
npm run test:coverage # roda testes com relatório de cobertura (threshold >= 80%)
npm run test:e2e      # roda a suíte E2E Playwright (e2e/) — ver e2e/README.md
npm run lint          # ESLint em api/ e web/ (e2e/ não tem ESLint configurado)
npm run typecheck     # tsc --noEmit em api/, web/ e e2e/
npm run build         # build de produção de api/ e web/
npm run db:generate   # drizzle-kit generate — nova migration a partir de api/src/db/schema.ts
npm run db:migrate    # aplica migrations pendentes em db/migrations/ (idempotente)
npm run db:seed       # garante/atualiza a estação `main` (idempotente)
```

`api/` e `web/` também expõem os mesmos scripts individualmente (`npm test`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, dentro da respectiva pasta). `e2e/` expõe um conjunto diferente e menor (ver `e2e/package.json`): `npm run test:e2e`, `npm run test:e2e:headed`, `npm run test:e2e:report` e `npm run typecheck` — não tem `lint` nem `test:coverage` próprios. `db:generate`/`db:migrate`/`db:seed` exigem `DATABASE_URL` no ambiente (via `.env` + Docker, ou exportada manualmente para rodar fora de containers — ver `db/README.md`).

## Variáveis de ambiente

Há **dois** arquivos de exemplo, um por ambiente — nunca misture os dois:

- `.env.example` → copie para `.env`, usado por `docker-compose.yml` (dev).
- `.env.prod.example` → copie para `.env.prod`, usado por `docker-compose.prod.yml` (produção).

| Variável | Serviço | dev (`.env.example`) | prod (`.env.prod.example`) | Descrição |
| --- | --- | --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | db | sim | sim | Credenciais do Postgres — **troque a senha antes de ir para produção** |
| `POSTGRES_PORT` | db | sim (padrão 5432) | sim (padrão 5432) | Porta publicada no host |
| `API_PORT` | api | sim (padrão 3000) | sim (padrão 3000) | Porta publicada no host e usada pelo Fastify |
| `NODE_ENV` | api/web | sim (`development`) | **não existe** — fixo em `production` no compose | `development` \| `test` \| `production` |
| `INGEST_API_KEY` | api | sim | sim | Segredo da estação para o header `X-API-Key` de `POST /api/v1/ingest` — ver `docs/ingest-api.md` e a seção de rotação abaixo |
| `MAX_BATCH` | api | sim (padrão 5000) | sim (padrão 5000) | Teto de leituras por lote em `POST /api/v1/ingest` (acima disso → `413`) |
| `RATE_LIMIT_MAX` | api | sim (padrão 100) | sim (padrão 100) | Requisições permitidas por janela em `POST /api/v1/ingest` (acima disso → `429`) — F7 |
| `RATE_LIMIT_WINDOW_MS` | api | sim (padrão 60000) | sim (padrão 60000) | Duração da janela de rate limit em ms (default 60s) — F7 |
| `LOG_LEVEL` | api | sim (padrão `info`) | sim (padrão `info`) | Nível do logger estruturado (pino) — `trace \| debug \| info \| warn \| error \| fatal \| silent`, validado por `parseLoggerEnv()` (`src/config/env.ts`) — F7 |
| `WEB_PORT` | web | sim (padrão 5173, dev server Vite) | sim (padrão 8080, mapeada para a porta 80 do Nginx) | Porta publicada no host |
| `API_TARGET` / `WEB_TARGET` | api/web | sim (`dev`) | **não existe** — stage sempre `runtime` | Estágio do Dockerfile usado pelo compose (`dev` \| `build` \| `runtime`) |

`DATABASE_URL` é montada automaticamente pelos dois composes a partir das variáveis `POSTGRES_*` (não precisa ser definida manualmente em nenhum dos dois ambientes).

## Gerando e rotacionando o `INGEST_API_KEY`

`INGEST_API_KEY` é o único segredo de autenticação do sistema (protege `POST /api/v1/ingest` — as rotas de leitura/dashboard são públicas por design, D2 em `.specs/project/STATE.md`). Trate-o como uma senha.

**Gerar um valor forte:**

```bash
# formato recomendado: prefixo whs_ (mesmo usado nos exemplos do repo,
# "weather station") + hex aleatório de alta entropia
echo "whs_$(openssl rand -hex 32)"
# ex.: whs_3f9a1c7e2b0d4f6a8c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a
```

Qualquer gerador de segredo com entropia equivalente serve (o prefixo `whs_` é só uma convenção para reconhecer o tipo de chave em logs/configuração — a API não valida o formato, só compara a string inteira em tempo constante contra `INGEST_API_KEY`).

**Rotacionar sem downtime da API:**

1. A chave é lida do env **de forma preguiçosa a cada requisição** (`getIngestApiKey` em `api/src/app.ts`, que por padrão chama `parseEnv().INGEST_API_KEY` — não é lida uma única vez no boot), então trocar a variável de ambiente e reiniciar o container `api` já é suficiente para a nova chave valer.
2. Passos práticos:
   - Gere a nova chave (comando acima).
   - Atualize `INGEST_API_KEY` no `.env`/`.env.prod`.
   - Reinicie só o serviço `api` (ex.: `docker compose up -d api` em dev, ou o equivalente com `-f docker-compose.prod.yml --env-file .env.prod` em produção) — não precisa recriar `db`/`web`.
3. **A estação física precisa ser reconfigurada com o novo valor ao mesmo tempo** — o v1 suporta **apenas uma chave ativa por vez** (não há período de sobreposição com múltiplas chaves válidas simultaneamente). Enquanto a estação ainda usa a chave antiga após a troca, toda ingestão dela recebe `401` até ser atualizada.
4. Por isso, **coordene a rotação**: troque o env + reinicie a `api` e atualize a configuração da estação na mesma janela de manutenção, para minimizar o tempo em que a ingestão real fica rejeitada. Se a estação tem buffer local (ver seção de firmware abaixo), leituras feitas durante essa janela não se perdem — só ficam retidas até a reconfiguração, e são aceitas (sem duplicar, por idempotência) assim que a chave nova estiver correta dos dois lados.

## Guia do firmware da estação

Contrato completo (payload, autenticação, respostas, exemplos `curl`) em **`docs/ingest-api.md`** — aqui vai só o resumo prático para quem implementa o firmware:

- Endpoint único: `POST /api/v1/ingest`, header `X-API-Key` obrigatório, corpo `{ "readings": [...] }` (campo `station_id` é opcional, default `"main"`).
- Cada leitura tem `timestamp` (ISO 8601 UTC, momento da **captura**, não do envio) + os 5 sensores (`temperature_c`, `humidity_pct`, `pressure_hpa`, `rain_mm`, `uv_index`), todos individualmente opcionais/nuláveis — um sensor com falha não invalida a leitura inteira.
- Resposta `202` sempre traz `{accepted, duplicates, rejected}` — o lote nunca é derrubado por um item inválido isolado.
- **Idempotência por `(station_id, timestamp)`**: reenviar o mesmo lote (ou parte dele) nunca duplica — é seguro reenviar sem checar antes se já foi processado.

Política de retry/buffer recomendada (detalhada com passo a passo em `docs/ingest-api.md`, seção "Política de retry/buffer recomendada para o firmware da estação"):

1. **Acumule leituras localmente** (buffer em disco/flash) sempre que a rede cair — nunca descarte uma leitura por falha de transmissão.
2. **Reenvie em lote** ao reconectar, não uma leitura por request (até `MAX_BATCH` itens por chamada; particione lotes maiores).
3. **Confie na idempotência**: pode reenviar o buffer inteiro sem medo de duplicar — o servidor deduplica por `(station_id, timestamp)`. Remova do buffer local só o que veio como `accepted`/`duplicates` na resposta.
4. **Backoff exponencial com teto e jitter** entre tentativas de transporte (timeout, `5xx`, sem rede) — nunca reenvie em loop apertado nem infinitamente sem limite.
5. `401` não é transitório (chave errada) — pare e sinalize erro de configuração em vez de fazer retry. `400`/`413` indicam payload/lote grande demais — reduza o lote em vez de repetir a mesma chamada.

## Observabilidade e operação

- **`GET /health`** reflete conectividade real com o Postgres (F7): `200 {"status":"ok"}` com o banco saudável, `503 {"status":"unhealthy"}` se o banco cair — a API nunca crasha ou entra em loop de erro por isso (`api/src/routes/health.ts`). Use este endpoint para o healthcheck do seu orquestrador/monitoramento externo.
- **Logs estruturados** (Fastify/pino, `api/src/config/logger.ts`): método, rota, status e latência de cada requisição, com `redact` garantindo que o header `X-API-Key` (e `Authorization`) **nunca aparece em claro no log**, mesmo quando os headers completos são logados para debug.
- **Rate limiting** (`@fastify/rate-limit`): aplicado apenas a `POST /api/v1/ingest` (o endpoint mais sensível a abuso, já que aceita lotes) — acima de `RATE_LIMIT_MAX` requisições por `RATE_LIMIT_WINDOW_MS`, responde `429`. As rotas de leitura (`/readings/*`, usadas pelo polling do dashboard) não são limitadas.
- **Headers de segurança** via `@fastify/helmet`, aplicados globalmente a todas as respostas.

## Testes

- **Unitários/integração** (`npm test`, raiz): Vitest em `api/` e `web/` — TDD, testes escritos antes da implementação (smoke de `app.ts`, integração de `/health`, `/api/v1/ingest`, `/api/v1/readings*` via `light-my-request`, render de componentes via Testing Library, constraints de schema/migrations via Postgres real).
  - Testes de banco (`api/test/db/`, `api/test/repositories/`, e a maioria de `api/test/routes/` — `health.test.ts`, `history.test.ts`, `ingest.test.ts`, `readings.test.ts`) sobem um Postgres 16 efêmero via **Testcontainers** (não dependem do `db` do compose estar de pé) para validar conectividade, constraints (`UNIQUE`, `FK`, nullability) e idempotência de migration/seed/ingestão (`ON CONFLICT DO NOTHING`). Exceção: `api/test/routes/rate-limit.test.ts` usa um `ReadingRepository` fake em memória (sem Postgres real) — o alvo daquele teste é só o comportamento de rate limit da rota de ingestão, não a camada de banco.
  - Cobertura mínima de 80% (lines/functions/branches/statements) configurada em `vitest.config.ts` de cada pacote.
  - Lint (ESLint) e format (Prettier) padronizados em `api/` e `web/`.
- **E2E** (`npm run test:e2e`, raiz — delega para `e2e/`): suíte Playwright que sobe o `docker compose` completo e valida o fluxo crítico ponta a ponta — ingestão via `POST /api/v1/ingest` aparecendo no dashboard (cards + gráficos), incluindo idempotência ao reenviar o mesmo lote. Detalhes de configuração, variáveis de ambiente da suíte e troubleshooting sem Docker em **`e2e/README.md`**.
- Contratos de API detalhados, com exemplos `curl` de todos os casos (sucesso, erros, idempotência): `docs/ingest-api.md` (ingestão) e `docs/history-api.md` (histórico/export, F8).
