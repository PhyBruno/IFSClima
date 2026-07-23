# F4 · API de Leitura — Design

## Endpoints

### `GET /api/v1/readings/latest`
Retorna a leitura mais recente (maior `timestamp`) da estação.

```jsonc
// 200
{
  "station_id": "main",
  "timestamp": "2026-07-23T14:30:00.000Z",   // null se não há leituras
  "age_seconds": 42,                            // null se timestamp null
  "temperature_c": 24.7,
  "humidity_pct": 61.2,
  "pressure_hpa": 1013.4,
  "rain_mm": 0.4,
  "uv_index": 5.3
}
```
Query: `SELECT ... ORDER BY timestamp DESC LIMIT 1` (usa índice `(station_id, timestamp DESC)`).

### `GET /api/v1/readings/series`
Query params (Zod):
- `metric` ∈ `temperature_c | humidity_pct | pressure_hpa | rain_mm | uv_index` (obrigatório)
- `range` ∈ `24h | 7d | 30d` (obrigatório)

```jsonc
// 200
{
  "metric": "temperature_c",
  "range": "24h",
  "bucket": "hour",
  "buckets": [
    { "t": "2026-07-23T13:00:00.000Z", "avg": 24.1, "min": 23.6, "max": 24.8 }
    // rain_mm inclui também "sum"
  ]
}
```

## Bucketing

| range | bucket | pontos aprox. |
| --- | --- | --- |
| 24h | hora (`date_trunc('hour', timestamp)`) | ≤ 24 |
| 7d  | hora | ≤ 168 |
| 30d | dia (`date_trunc('day', timestamp)`) | ≤ 30 |

Query padrão (exemplo 24h temperatura):
```sql
SELECT date_trunc('hour', timestamp) AS t,
       avg(temperature_c) AS avg, min(temperature_c) AS min, max(temperature_c) AS max
FROM readings
WHERE station_id = $1 AND timestamp >= now() - interval '24 hours'
GROUP BY t ORDER BY t;
```
Para `rain_mm`, adicionar `sum(rain_mm) AS sum` (READ-10).

## Camadas

- **Route** (`routes/readings.ts`): valida query (Zod), chama service, retorna.
- **Service** (`services/readings-service.ts`): `getLatest()`, `getSeries(metric, range)`. Calcula `age_seconds` = `now - timestamp`. Mapeia range→(interval, bucket).
- **Repository** (`repositories/reading-repository.ts`): estende o de F3 com `findLatest(stationId)`, `aggregate(stationId, metric, interval, bucketUnit)`.
- **Schemas** (`schemas/readings.ts`): Zod de query + response.

## Decisões de design

| Tema | Decisão | Razão |
| --- | --- | --- |
| Estado vazio | `latest` sem dados → 200 com nulls, não 404 | Dashboard sempre renderiza; 404 seria erro falso (READ-03) |
| Lacunas na série | bucket simplesmente ausente (não preenche zeros) | Não inventar dados (READ-09); dashboard mostra a lacuna |
| Métrica dinâmica | whitelist de colunas (nunca interpolar input em SQL) | Segurança contra SQL injection |
| `rain_mm` sum | expor `sum` além de avg/min/max | Chuva acumulada é a métrica útil (READ-10) |
| 7d bucket | hora (168 pts) | Boa resolução sem pesar; UI decide densidade |
| Timezone | agregação em UTC; formatação no cliente | Servidor não assume fuso |
| Cache | sem cache no v1 (dataset pequeno); header `Cache-Control: no-store` | Simplicidade; polling do dashboard |

## Segurança

`metric` NUNCA é concatenada em SQL crua — mapa `metric → coluna Drizzle` (whitelist). `range` idem. Injeção impossível.

## Reuso

- Repository, db client e schema de F2/F3.
- `app.ts` de F1 para registrar as rotas.
