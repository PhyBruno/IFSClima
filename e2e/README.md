# `e2e/` — Suíte E2E Playwright (F7 T7.1)

Testa o fluxo crítico ponta a ponta: ingestão (`POST /api/v1/ingest`) →
persistência → dashboard (cards + gráficos), incluindo idempotência ao
reenviar o mesmo lote. Ver `.specs/features/f7-e2e-deploy/spec.md` (T7.1,
QA-01/QA-02/QA-03).

Este pacote é **separado** de `npm test` (raiz) — é uma categoria de teste
mais pesada (sobe o stack inteiro) que não roda por padrão em todo `npm
install`/CI rápido, só quando explicitamente pedida.

## Rodar contra o `docker compose` (caminho "de verdade")

```bash
# na raiz do monorepo
cp .env.example .env   # se ainda não existir
docker compose up -d --wait
npm run test:e2e --prefix e2e
docker compose down
```

`--wait` espera os healthchecks (`db` via `pg_isready`, `api` via `GET
/health`) antes de devolver o prompt — sem isso a suíte pode começar a rodar
contra uma `api`/`web` ainda de boot.

## Variáveis de ambiente da suíte

| Variável | Default | Para quê |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost:5173` | onde o `web` (dashboard) responde — mesmo `WEB_PORT` do `.env.example` |
| `E2E_API_URL` | `http://localhost:3000` | onde a `api` responde diretamente (ingestão via `request` do Playwright, sem passar pelo proxy do Vite) — mesmo `API_PORT` |
| `E2E_INGEST_API_KEY` | `whs_test_ABC123` | header `X-API-Key` usado pelo teste para ingerir — troque se o `.env` local usar outro `INGEST_API_KEY` |

Se você mudou `WEB_PORT`/`API_PORT`/`INGEST_API_KEY` no seu `.env`, exporte
as três variáveis acima com os mesmos valores antes de rodar `test:e2e`.

## Scripts

- `npm run test:e2e --prefix e2e` — roda a suíte (`playwright test`).
- `npm run test:e2e:headed --prefix e2e` — mesma suíte, navegador visível
  (debug local).
- `npm run test:e2e:report --prefix e2e` — abre o último relatório HTML
  (screenshots/traces de falha ficam em `e2e/test-results/` e
  `e2e/playwright-report/`, configurado em `playwright.config.ts` como
  `screenshot: "only-on-failure"` / `trace: "on-first-retry"` /
  `video: "retain-on-failure"`).
- `npm run typecheck --prefix e2e` — `tsc --noEmit` (config + testes são
  TypeScript).

Um atalho agregado também existe na raiz: `npm run test:e2e` (delega para o
script acima). Ele **não** faz parte de `npm test` — aquele continua sendo
só api+web (unitários), rápido o bastante para rodar em todo commit/CI.

## Instalação

```bash
npm install --prefix e2e
```

O Chromium usado pelos testes é resolvido em duas situações:

- **Ambiente normal** (sua máquina/CI): `npm install --prefix e2e` baixa o
  Chromium do Playwright normalmente (mesmo fluxo de qualquer projeto
  Playwright — não precisa de nenhum passo extra).
- **Sandbox com Chromium pré-instalado fora do cache padrão**
  (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, ambiente usado para validar
  esta task): `playwright.config.ts` detecta essa variável e aponta
  `launchOptions.executablePath` para `/opt/pw-browsers/chromium` — **não
  rode `playwright install`** nesse caso (a var
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` já evita isso no `npm install`, mas
  não custa evitar rodar o comando manualmente).

## Troubleshooting — sem Docker disponível

Se `docker compose up` falhar (rede restrita para `docker pull` de um
registry externo, ou o Docker daemon simplesmente não estiver disponível no
ambiente), a suíte Playwright em si **não depende de Docker** — só precisa
de um `web` e uma `api` respondendo nos endereços de `E2E_BASE_URL`/
`E2E_API_URL`. Um fallback local válido (o mesmo espírito do fallback de
Testcontainers documentado em `.specs/project/STATE.md`):

1. Suba um Postgres 16 local (ex. pacote `postgresql-16` do `apt`, ou
   qualquer Postgres 16 já rodando) e crie o banco/usuário que
   `DATABASE_URL` vai apontar.
2. `api/`: `DATABASE_URL=postgres://... INGEST_API_KEY=whs_test_ABC123
   PORT=3000 npm run dev --prefix api` (aplica migrations + seed da estação
   `main` sozinho no boot, ver `api/src/server.ts`).
3. `web/`: `npm run dev --prefix web` (ou `npm run build && npm run
   preview --prefix web` para simular produção) — o proxy do Vite
   (`vite.config.ts`) já usa `http://localhost:3000` como default fora do
   Docker.
4. `npm run test:e2e --prefix e2e` com os defaults (`E2E_BASE_URL=
   http://localhost:5173`, `E2E_API_URL=http://localhost:3000`).

Isso prova que a suíte (seletores, lógica, asserções) está correta contra
uma instância real da aplicação — **não** é equivalente a validar o
`docker compose` de produção/dev em si (imagens, healthchecks, rede entre
containers), que precisa ser revalidado assim que Docker estiver disponível.
