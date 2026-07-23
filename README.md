# Estação Meteorológica

Plataforma web que recebe, armazena e visualiza os dados de uma estação meteorológica in loco (temperatura, umidade, pressão, chuva, UV) em tempo real e em histórico.

> Este repositório está na fase **F3 — Endpoint de ingestão `POST /api/v1/ingest`**: além do scaffold (F1) e do schema/migrations (F2), a API já aceita lotes de leituras da estação de forma autenticada, validada e idempotente — ver `docs/ingest-api.md` para o contrato completo. API de leitura (F4), design system (F5), dashboard (F6) e E2E/deploy (F7) são entregues em features seguintes.

## Stack

| Camada | Tecnologia |
| --- | --- |
| API | Fastify + Node.js 20 LTS + TypeScript |
| Web | React 18 + Vite + TypeScript + Tailwind CSS |
| Banco | PostgreSQL 16 |
| Testes | Vitest (+ light-my-request na api, Testing Library na web) |
| Containers | Docker + Docker Compose |

## Estrutura

```
/
├── api/                 # Fastify + TS (porta padrão 3000)
│   ├── src/
│   │   ├── app.ts       # factory Fastify (testável sem subir porta)
│   │   ├── server.ts    # bootstrap (valida env, roda migrations/seed, sobe o listen)
│   │   ├── config/env.ts# validação de env com Zod
│   │   ├── db/          # F2: schema Drizzle, client pg, migrate.ts, seed.ts
│   │   ├── schemas/     # F3: contrato Zod (ingest.ts)
│   │   ├── repositories/# F3: ReadingRepository (Drizzle)
│   │   ├── services/    # F3: IngestService (regras de negócio)
│   │   ├── plugins/     # F3: auth-api-key.ts (X-API-Key, tempo-constante)
│   │   └── routes/       # health.ts, ingest.ts (F3 — POST /api/v1/ingest)
│   ├── test/
│   ├── drizzle.config.ts
│   └── Dockerfile
├── web/                 # React + Vite + TS (porta padrão 5173)
│   ├── src/
│   ├── test/
│   └── Dockerfile
├── db/                  # F2: migrations SQL geradas (drizzle-kit) — ver db/README.md
│   └── migrations/
├── docker-compose.yml
├── .env.example
└── package.json         # scripts agregados (test/lint/typecheck/build/db:*)
```

## Quickstart (Docker — recomendado)

Pré-requisitos: Docker + Docker Compose. Nenhuma instalação de Node/Postgres na máquina é necessária.

```bash
cp .env.example .env
# edite .env se quiser trocar portas/senha local

docker compose up -d
curl http://localhost:3000/health   # -> {"status":"ok"}

# F3: ingestão de leituras (contrato completo em docs/ingest-api.md)
curl -i -X POST http://localhost:3000/api/v1/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: whs_test_ABC123" \
  -d '{"readings":[{"timestamp":"2026-07-23T14:30:00.000Z","temperature_c":24.7}]}'
# -> 202 {"accepted":1,"duplicates":0,"rejected":[]}

# web: http://localhost:5173
```

Os serviços sobem nesta ordem, aguardando saúde uns dos outros:

1. `db` (postgres:16) — healthcheck via `pg_isready`.
2. `api` — só inicia após `db` estar `healthy` (`depends_on: condition: service_healthy`); expõe `GET /health`.
3. `web` — só inicia após `api` estar `healthy`.

Se faltar uma variável obrigatória (`DATABASE_URL`, `API_KEY` ou `INGEST_API_KEY`), a `api` falha o boot com uma mensagem clara listando o campo e o motivo (validação Zod em `src/config/env.ts`).

No boot, a `api` também roda as **migrations Drizzle** (`db/migrations/`) e o **seed** da estação `main` automaticamente, antes de aceitar tráfego (idempotente — seguro em todo restart). Veja `db/README.md` para o schema completo.

Para parar e remover os containers: `docker compose down` (adicione `-v` para também apagar o volume de dados do Postgres).

## Quickstart (sem Docker — desenvolvimento local)

Requer Node.js 20+.

```bash
npm run install:all      # instala api/ e web/

# em dois terminais:
npm run dev:api           # http://localhost:3000 (requer .env — veja abaixo)
npm run dev:web            # http://localhost:5173
```

A api local também valida env via Zod; exporte pelo menos `DATABASE_URL` e `API_KEY` (veja `.env.example`) antes de `npm run dev:api`.

## Scripts agregados (raiz)

```bash
npm test             # roda Vitest em api/ e web/
npm run test:coverage # roda testes com relatório de cobertura (threshold >= 80%)
npm run lint          # ESLint em api/ e web/
npm run typecheck     # tsc --noEmit em api/ e web/
npm run build         # build de produção de api/ e web/
npm run db:generate   # drizzle-kit generate — nova migration a partir de api/src/db/schema.ts
npm run db:migrate    # aplica migrations pendentes em db/migrations/ (idempotente)
npm run db:seed       # garante/atualiza a estação `main` (idempotente)
```

Cada pacote (`api/`, `web/`) também expõe os mesmos scripts individualmente (`npm test`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, dentro da respectiva pasta). `db:generate`/`db:migrate`/`db:seed` exigem `DATABASE_URL` no ambiente (via `.env` + Docker, ou exportada manualmente para rodar fora de containers — ver `db/README.md`).

## Variáveis de ambiente

Veja `.env.example` para a lista completa e valores de exemplo (sintéticos). Resumo:

| Variável | Serviço | Descrição |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | db | Credenciais do Postgres |
| `POSTGRES_PORT` | db | Porta publicada no host (padrão 5432) |
| `API_PORT` | api | Porta publicada no host e usada pelo Fastify (padrão 3000) |
| `NODE_ENV` | api/web | `development` \| `test` \| `production` |
| `API_KEY` | api | Reservada (F1) — não usada pelo endpoint de ingestão; ver `INGEST_API_KEY` |
| `INGEST_API_KEY` | api | Segredo da estação para o header `X-API-Key` de `POST /api/v1/ingest` (F3) — ver `docs/ingest-api.md` |
| `MAX_BATCH` | api | Teto de leituras por lote em `POST /api/v1/ingest` (padrão 5000; acima disso → `413`) |
| `WEB_PORT` | web | Porta publicada no host (padrão 5173) |
| `API_TARGET` / `WEB_TARGET` | api/web | Estágio do Dockerfile usado pelo compose (`dev` no dia a dia; `build`/`runtime` para produção) |

`DATABASE_URL` é montada automaticamente pelo `docker-compose.yml` a partir das variáveis `POSTGRES_*` (não precisa ser definida manualmente ao usar Docker).

## Qualidade

- TDD: testes escritos antes da implementação (smoke de `app.ts`, integração de `/health` e `/api/v1/ingest` via `light-my-request`, render de `<App />` via Testing Library, constraints de schema/migrations via Postgres real).
- Testes de banco (F2/F3, `api/test/db/`, `api/test/repositories/`, `api/test/routes/`) sobem um Postgres 16 efêmero via **Testcontainers** (não dependem do `db` do compose estar de pé) para validar conectividade, constraints (`UNIQUE`, `FK`, nullability), idempotência de migration/seed e idempotência da ingestão (`ON CONFLICT DO NOTHING`).
- Cobertura mínima de 80% (lines/functions/branches/statements) configurada em `vitest.config.ts` de cada pacote.
- Lint (ESLint) e format (Prettier) padronizados em `api/` e `web/`.
- F3 (`POST /api/v1/ingest`): contrato completo, exemplos `curl` e política de retry/buffer recomendada para o firmware da estação em `docs/ingest-api.md`.
