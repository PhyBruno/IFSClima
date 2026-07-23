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
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
