# syntax=docker/dockerfile:1

# ---- base: dependências compartilhadas ----
FROM node:20-alpine AS base
WORKDIR /app
COPY web/package*.json ./

# ---- deps: instala todas as dependências (dev incluído) ----
FROM base AS deps
RUN npm ci

# ---- dev: usado por `docker compose up` no dia a dia (hot reload via volume) ----
FROM deps AS dev
COPY web/. .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# ---- build: gera os assets estáticos de produção ----
FROM deps AS build
COPY web/. .
RUN npm run build

# ---- runtime: Nginx servindo os assets estáticos ----
# F7 (revisão de código): o processo MASTER do Nginx roda como root nesta
# imagem oficial, mas apenas para poder abrir a porta 80 (privilegiada,
# <1024) — os processos WORKER, que de fato processam as requisições, já
# rodam como o usuário não-privilegiado `nginx` por padrão em
# `nginx:1.27-alpine`. Isso é o comportamento padrão da imagem oficial e é
# aceitável aqui: a superfície que atende tráfego (workers) já não é root.
#
# Avaliada a alternativa de trocar para a variante "unprivileged" (que
# escuta em 8080 em vez de 80, eliminando root também do master), mas ela
# exigiria editar `web/nginx.conf` (`listen 80;` -> `listen 8080;`) e o
# mapeamento de porta do serviço `web` em `docker-compose.prod.yml`
# (hoje `"${WEB_PORT:-80}:80"` -> teria que virar `"${WEB_PORT:-80}:8080"`)
# — ambos fora do escopo permitido nesta tarefa (outro subagent mexe em
# `docker-compose.prod.yml` em paralelo). Mantido `nginx:1.27-alpine` com
# master root por enquanto; migrar para a variante unprivileged fica como
# follow-up caso alguém queira eliminar o último root do stack `web`.
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
