# syntax=docker/dockerfile:1

# ---- base: dependências compartilhadas ----
FROM node:20-alpine AS base
WORKDIR /app
COPY api/package*.json ./

# ---- deps: instala todas as dependências (dev incluído, para build/test) ----
FROM base AS deps
RUN npm ci

# ---- dev: usado por `docker compose up` no dia a dia (hot reload via volume) ----
FROM deps AS dev
COPY api/. .
# F2 (T2.4): migrations Drizzle vivem em db/migrations na raiz do monorepo;
# copiadas para /db (fora de /app) para que `src/db/migrate.ts` as ache via
# caminho relativo, tanto em dev (sobrescrito pelo volume `./db:/db` do
# compose, para pegar migrations novas sem rebuild) quanto em runtime.
COPY db/migrations /db/migrations
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---- build: compila TypeScript -> dist ----
FROM deps AS build
COPY api/. .
RUN npm run build

# ---- prod-deps: apenas dependências de produção ----
FROM base AS prod-deps
RUN npm ci --omit=dev

# ---- runtime: imagem final de produção ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node api/package*.json ./
# F2 (T2.4): mesma lógica do stage `dev` — migrations disponíveis em /db
# para o boot da api rodar `runMigrations`/`seedMainStation` automaticamente.
COPY --chown=node:node db/migrations /db/migrations
EXPOSE 3000
# F7 (revisão de código): `node:20-alpine` já traz o usuário não-privilegiado
# `node` (uid 1000) pronto pra uso — sem `USER node`, o processo roda como
# root dentro do container à toa (a api não abre porta privilegiada; `PORT`
# default 3000 já é >1024). `--chown=node:node` em cada `COPY` acima garante
# que `node_modules`/`dist`/`package*.json`/`/db/migrations` sejam donos do
# usuário antes da troca, para não quebrar leitura/execução em runtime.
USER node
CMD ["node", "dist/server.js"]
