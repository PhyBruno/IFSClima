# Roadmap — Estação Meteorológica

Sequência de milestones e features. Cada feature será especificada (Specify → Design → Tasks → Execute) com auto-sizing e implementada via subagents em TDD.

## Milestone 1 — Fundação & Infra

- **F1 · Scaffold do monorepo + tooling + Docker Compose**
  Estrutura `api/` + `web/` + `db/`, TypeScript, ESLint/Prettier, Vitest configurado, Docker Compose (api, web, postgres) subindo com `docker compose up`. Healthcheck básico.
  _Depends on: —_

- **F2 · Schema do banco + migrations (Drizzle)**
  Tabelas `stations` e `readings`, índices para consulta temporal, constraint de unicidade `(station_id, timestamp)` para idempotência. Migrations versionadas.
  _Depends on: F1_

## Milestone 2 — Ingestão (núcleo)

- **F3 · Endpoint de ingestão `POST /api/v1/ingest`**
  Auth por `X-API-Key`, validação Zod do contrato, processamento de lote, dedupe idempotente, resposta `202` com contadores. Rejeição por leitura (não derruba o lote). O coração do sistema.
  _Depends on: F2_

## Milestone 3 — API de Leitura

- **F4 · Endpoints de leitura para o dashboard**
  `GET /api/v1/readings/latest` (leitura atual), `GET /api/v1/readings/series?metric=&range=24h|7d|30d` (séries agregadas por hora/dia: média/min/máx). Contratos tipados com Zod.
  _Depends on: F2 (dados de F3 para testes de integração realistas)_

## Milestone 4 — Dashboard Web/UI

- **F5 · Extração do design + design system**
  Extrair tokens (cores, tipografia, espaçamento, sombras) e componentes do `Estacao Meteorologica (standalone).html` via subagent + `ui-ux-pro-max`. Tema escuro, config Tailwind, biblioteca de componentes base.
  _Depends on: F1_

- **F6 · Dashboard responsivo**
  Página única: cards por sensor (temperatura, umidade, pressão, chuva, UV) com leitura atual + gráficos com seletor de período (24h/7d/30d), consumindo F4. Responsivo desktop/mobile, fiel ao design.
  _Depends on: F4, F5_

- **F8 · Página de histórico + exportação (CSV/XLSX)**
  Fatia vertical: endpoints de listagem paginada de leituras brutas por intervalo de datas + exportação server-side (CSV/XLSX via `exceljs`), e página de histórico (tabela filtrável, paginada, com download). Reusa design system (F5).
  _Depends on: F2, F5, F6 (navegação/layout compartilhado)_

## Milestone 5 — Qualidade & Deploy

- **F7 · E2E, hardening & deploy**
  Testes E2E Playwright dos fluxos críticos (ingestão → aparece no dashboard; histórico → exportação CSV/XLSX), observabilidade (logs estruturados, health), imagens Docker de produção multi-stage, README de operação, variáveis de ambiente/segredos.
  _Depends on: F3, F6, F8_

## Ordem de execução sugerida

```
F1 → F2 → F3 → F4 ─┐
      └→ F5 ────────┼→ F6 ─┬→ F8 ─┐
                            └──────┴→ F7
```

F5 (design system) pode rodar em paralelo com F2/F3/F4 pois só depende de F1.
F8 (histórico + exportação) vem depois de F6 (reusa layout/navegação e design system).
