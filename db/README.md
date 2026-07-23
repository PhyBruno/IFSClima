# db/

Migrations SQL versionadas do Postgres, geradas pelo Drizzle Kit a partir do schema TypeScript.

```
db/
├── migrations/
│   ├── 0000_big_viper.sql   # migration inicial: tabelas stations + readings
│   └── meta/                 # snapshots + journal do drizzle-kit (não editar à mão)
└── README.md
```

## Onde vive cada coisa (F2)

O schema Drizzle, o client pg e os scripts de migration/seed ficam em `api/` (mesmo pacote que já valida `DATABASE_URL` via Zod em F1) — só o **SQL gerado** mora aqui, para manter migrations desacopladas do código da aplicação:

- `api/src/db/schema.ts` — definição das tabelas `stations` e `readings` (Drizzle).
- `api/src/db/client.ts` — pool `pg` + client Drizzle, lendo `DATABASE_URL` do env validado.
- `api/src/db/migrate.ts` — roda as migrations desta pasta (`runMigrations`); também executável via CLI.
- `api/src/db/seed.ts` — garante/atualiza a estação `main` (`seedMainStation`), idempotente.
- `api/drizzle.config.ts` — config do `drizzle-kit` (`schema` aponta pra `api/src/db/schema.ts`, `out` aponta pra cá: `../db/migrations`).

## Como gerar/rodar

```bash
# a partir de api/ (ou via npm --prefix api ... na raiz)
npm run db:generate   # drizzle-kit generate — cria uma nova migration a partir de mudanças no schema.ts
npm run db:migrate    # aplica as migrations pendentes nesta pasta (idempotente)
npm run db:seed       # garante a estação `main` (idempotente — cria ou atualiza)
```

Em container, o boot da `api` (`src/server.ts`) já roda `runMigrations` + `seedMainStation` automaticamente antes de aceitar tráfego — não é preciso rodar `db:migrate`/`db:seed` manualmente ao usar `docker compose up`. Ver `api/Dockerfile` (`COPY db/migrations /db/migrations`) e `docker-compose.yml` (volume `./db/migrations:/db/migrations:ro` no serviço `api`, para pegar migrations novas sem rebuild).

## Schema (resumo — ver `.specs/features/f2-schema/spec.md` para o contrato completo)

- `stations(id text PK, name text NOT NULL, created_at timestamptz NOT NULL default now())` — seed único: `main`.
- `readings(id bigserial PK, station_id text NOT NULL FK→stations.id, timestamp timestamptz NOT NULL, temperature_c/humidity_pct/pressure_hpa/rain_mm/uv_index real NULL, received_at timestamptz NOT NULL default now())`.
  - `UNIQUE(station_id, timestamp)` — idempotência da ingestão (permite `ON CONFLICT DO NOTHING`).
  - `INDEX(station_id, timestamp DESC)` — consultas por intervalo de tempo (dashboard/histórico).
