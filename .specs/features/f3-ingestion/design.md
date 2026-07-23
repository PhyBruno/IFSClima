# F3 · Ingestão — Design

## Visão de arquitetura

```
POST /api/v1/ingest
      │
      ▼
[hook auth: X-API-Key]───► 401 se inválida (compare tempo-constante)
      │ ok
      ▼
[Fastify route handler]
      │  parse JSON (limite de body)
      ▼
[Zod schema: IngestRequest]───► 400 se estrutura inválida ; 413 se > MAX_BATCH
      │ ok
      ▼
[IngestService.ingest(payload)]
      │  1. normaliza timestamps → UTC
      │  2. valida faixas físicas por leitura → separa válidas/rejeitadas
      │  3. dedupe intra-lote por (station_id, timestamp)
      │  4. garante estação (upsert 'main')
      │  5. bulk insert ON CONFLICT (station_id,timestamp) DO NOTHING
      │     → retorna quantas linhas realmente inseridas
      ▼
[202] { accepted, duplicates, rejected[] }
```

## Camadas (Clean-ish, testável)

- **Route** (`routes/ingest.ts`): só HTTP — auth hook, parse, chama service, mapeia resultado→status. Sem regra de negócio.
- **Service** (`services/ingest-service.ts`): regra pura + orquestração de persistência. Recebe um `ReadingRepository` (interface) → testável com fake/in-memory e com Postgres real.
- **Repository** (`repositories/reading-repository.ts`): Drizzle. `insertIgnoreConflicts(readings): number` (linhas inseridas), `ensureStation(id)`.
- **Schemas** (`schemas/ingest.ts`): Zod. Fonte única do contrato; tipos derivados com `z.infer`.

## Contrato (Zod)

```ts
// schemas/ingest.ts
const Reading = z.object({
  timestamp: z.string().datetime({ offset: true }), // ISO 8601, aceita Z/offset
  temperature_c: z.number().nullish(),
  humidity_pct:  z.number().nullish(),
  pressure_hpa:  z.number().nullish(),
  rain_mm:       z.number().nullish(),
  uv_index:      z.number().nullish(),
});
const IngestRequest = z.object({
  station_id: z.string().min(1).default("main"),
  readings: z.array(Reading).max(5000),
});
```

> **Nota:** Zod valida a *estrutura* (tipos + tamanho do lote). As **faixas físicas** e o **timestamp futuro** são checados no service para poder rejeitar **por item** (um `z.array` com item fora de faixa falharia o array inteiro, violando ING-03). Assim um item ruim vai para `rejected[]` sem derrubar o lote.

Faixas físicas aplicadas em `validateReading()`: `temperature_c` [-90,60], `humidity_pct` [0,100], `pressure_hpa` [300,1100], `rain_mm` [0,∞) (sem teto — alinhado ao PROJECT.md; só rejeitado se negativo), `uv_index` [0,20].

## Decisões de design

| Tema | Decisão | Razão |
| --- | --- | --- |
| Estação inexistente | `ensureStation(station_id)` faz upsert (cria se não existir) | Estação única no v1; evita 400 por seed faltante; multi-estação futura só precisa de cadastro |
| Idempotência | `INSERT ... ON CONFLICT (station_id,timestamp) DO NOTHING` + contar `rowCount` | Atômico, sem race; banco é a fonte da verdade (D6/DB-01) |
| `accepted` vs `duplicates` | `accepted` = linhas inseridas; `duplicates` = (válidas − inseridas) | Distinção precisa mesmo sob concorrência |
| Dedupe intra-lote | Map por `station_id|timestamp` antes do insert | Evita ambiguidade de contagem |
| Timestamp futuro | rejeitar se `> now + 5min` (tolerância de clock) | Protege séries do dashboard (ING-10) |
| Auth | header `X-API-Key`, `crypto.timingSafeEqual` | Simplicidade + segurança (ING-05) |
| Status codes | 202 (aceito p/ processar), 400 (estrutura), 401 (auth), 413 (grande) | Semântica REST (ecc:api-design) |

## Resposta

```json
{
  "accepted": 12,
  "duplicates": 3,
  "rejected": [
    { "index": 4, "reason": "temperature_c out of range (min -90, max 60)" },
    { "index": 9, "reason": "timestamp is in the future" }
  ]
}
```

## Riscos / mitigação

- **Bulk insert grande** → chunk de N (ex.: 1000) por statement. Testar lote de 5000.
- **Timezone** → sempre converter para UTC no service (`new Date(iso).toISOString()`), persistir `timestamptz`.
- **Segredo em logs** → nunca logar `X-API-Key` nem body cru com chave.

## Reuso

- `app.ts`, `config/env.ts` (F1) → adicionar `INGEST_API_KEY`, `MAX_BATCH`.
- `db client` + schema `readings`/`stations` (F2).
