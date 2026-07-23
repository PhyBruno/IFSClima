# Estação Meteorológica

**Vision:** Plataforma web/mobile responsiva que recebe, armazena e visualiza os dados de uma estação meteorológica in loco, alimentada por um único endpoint de ingestão e um dashboard de tema escuro.
**For:** O proprietário da estação (e futuros observadores), que quer acompanhar temperatura, umidade, pressão, chuva e UV em tempo real e em histórico.
**Solves:** Hoje os dados ficam presos no equipamento. O sistema centraliza as leituras num banco confiável e as exibe de forma clara, tolerando quedas de conexão da estação.

## Goals

- **Ingestão confiável e idempotente:** 100% das leituras enviadas pela estação (inclusive lotes acumulados offline) são persistidas exatamente uma vez, sem duplicar.
- **Visualização em tempo real + histórico:** dashboard mostra a leitura atual e séries agregadas de 24h/7d/30d, responsivo em desktop e mobile.
- **Fidelidade ao design:** UI segue o padrão visual de `Estacao Meteorologica (standalone).html` (tema escuro, cards por sensor).
- **Qualidade por construção:** TDD com cobertura ≥80% em unidade/integração e E2E dos fluxos críticos.

## Tech Stack

**Core:**

- Backend: Fastify (Node.js 20 LTS) + TypeScript
- Frontend: React 18 + Vite + TypeScript + Tailwind CSS
- Database: PostgreSQL 16
- ORM/migrations: Drizzle ORM

**Key dependencies:**

- Zod (validação de payload de ingestão e contratos de API)
- Recharts (gráficos do dashboard)
- Vitest + Supertest/light-my-request (testes de unidade/integração)
- Playwright (E2E)
- Docker + Docker Compose (containerização 100%)

## Contrato de Ingestão (API ← Estação)

Único endpoint de entrada. Decidido pelo time (a estação não tinha padrão definido).

**Request:** `POST /api/v1/ingest`

**Headers:**

```
Content-Type: application/json
X-API-Key: whs_test_ABC123        # autenticação da estação (segredo por ambiente)
```

**Body (lote — suporta buffer offline):**

```json
{
  "station_id": "main",
  "readings": [
    {
      "timestamp": "2026-07-23T14:30:00.000Z",
      "temperature_c": 24.7,
      "humidity_pct": 61.2,
      "pressure_hpa": 1013.4,
      "rain_mm": 0.4,
      "uv_index": 5.3
    }
  ]
}
```

**Regras de contrato:**

- `readings` é um **array** → a estação acumula leituras localmente quando está sem rede e envia várias de uma vez ao reconectar.
- `timestamp` é o **momento da leitura** (não do envio), em **ISO 8601 UTC** (sufixo `Z`, com milissegundos). Isso preserva a linha do tempo real mesmo em envios atrasados.
- Cada campo de sensor é **individualmente opcional/nullable**: se um sensor falhar, a leitura ainda é válida (o campo vem `null`/ausente).
- **Idempotência:** deduplicação por `(station_id, timestamp)`. Reenvio do buffer nunca duplica dados.
- Faixas válidas (validação Zod): `temperature_c` [-90,60], `humidity_pct` [0,100], `pressure_hpa` [300,1100], `rain_mm` [0,∞), `uv_index` [0,20]. Fora da faixa → leitura rejeitada individualmente, sem derrubar o lote.
- `rain_mm` = precipitação **acumulada no intervalo** daquela leitura (mm).

**Response:** `202 Accepted`

```json
{ "accepted": 12, "duplicates": 3, "rejected": [] }
```

## Scope

**v1 includes:**

- Endpoint único de ingestão (`POST /api/v1/ingest`) com API key, validação, lote e idempotência.
- Persistência em PostgreSQL (tabela de leituras + estação).
- API de leitura para o dashboard (leitura atual + séries agregadas 24h/7d/30d).
- API de histórico: listagem paginada de leituras brutas por intervalo de datas + exportação CSV/XLSX.
- Dashboard web/mobile responsivo, tema escuro fiel ao design, com cards por sensor e gráficos.
- Página de histórico detalhado: tabela de leituras brutas filtrável por intervalo de datas, paginada, com download em CSV e XLSX.
- Containerização completa via Docker Compose (api + web + db).
- Suíte TDD (unit/integração) + E2E dos fluxos críticos.

**Explicitly out of scope (v1):**

- Login/autenticação do dashboard (dashboard é público).
- Múltiplas estações na UI (schema já prevê `station_id`, mas UI é de estação única).
- Alertas/notificações de valores extremos.
- Previsão do tempo / integração com serviços externos de meteorologia.
- App nativo (a experiência mobile é via web responsiva).
- Multiusuário / gestão de contas.

## Constraints

- **Técnica:** stack 100% TypeScript/JS; 100% containerizável (roda com `docker compose up`).
- **Processo:** desenvolvimento por TDD e SDD; todas as implementações via subagents.
- **Design:** fidelidade ao `Estacao Meteorologica (standalone).html`, aplicando `ui-ux-pro-max`.
- **Resiliência:** a estação pode ficar offline; o contrato e a ingestão precisam tolerar lotes atrasados e reenvios.
