# `POST /api/v1/ingest` — Contrato de ingestão (F3)

Único ponto de entrada de dados da estação meteorológica. Recebe um lote de
leituras, autentica a origem, valida e persiste de forma idempotente,
respondendo com um resumo de quantas leituras foram aceitas, quantas eram
duplicatas e quais foram rejeitadas (e por quê).

> Implementação: `api/src/routes/ingest.ts` → `api/src/services/ingest-service.ts`
> → `api/src/repositories/reading-repository.ts`. Contrato estrutural (Zod):
> `api/src/schemas/ingest.ts`. Testes: `api/test/routes/ingest.test.ts`,
> `api/test/services/ingest-service.test.ts`, `api/test/repositories/reading-repository.test.ts`.

## Autenticação

Header obrigatório `X-API-Key`, comparado em tempo constante contra o valor
de `INGEST_API_KEY` (env da API — ver `.env.example`). Nunca hardcoded.

```
X-API-Key: whs_test_ABC123
```

- Header ausente ou incorreto → `401` (corpo genérico, sem detalhe — não
  vaza se a chave "quase bateu" nem o motivo exato).
- A chave nunca é logada, nem em erro nem em log de acesso.

## Request

```
POST /api/v1/ingest
Content-Type: application/json
X-API-Key: whs_test_ABC123
```

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

| Campo | Tipo | Obrigatório | Notas |
| --- | --- | --- | --- |
| `station_id` | string | não (default `"main"`) | estação única no v1; schema já preparado para multi-estação |
| `readings` | array | sim | até `MAX_BATCH` itens (default **5000**; acima disso → `413`) |
| `readings[].timestamp` | string ISO 8601 (UTC) | sim | momento da **leitura**, não do envio; aceita offset (`Z` ou `+HH:MM`), normalizado para UTC no servidor |
| `readings[].temperature_c` | number \| null | não | faixa válida `[-90, 60]` |
| `readings[].humidity_pct` | number \| null | não | faixa válida `[0, 100]` |
| `readings[].pressure_hpa` | number \| null | não | faixa válida `[300, 1100]` |
| `readings[].rain_mm` | number \| null | não | faixa válida `[0, ∞)` (sem teto superior); só rejeitada se negativa; precipitação acumulada no intervalo da leitura |
| `readings[].uv_index` | number \| null | não | faixa válida `[0, 20]` |

Qualquer campo de sensor pode vir `null` ou ausente — se um sensor falhar em
campo, a leitura continua válida com os demais campos.

## Response — `202 Accepted`

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

- `accepted` — leituras **novas** de fato persistidas nesta chamada.
- `duplicates` — leituras válidas que já existiam (mesmo `station_id` +
  `timestamp`, seja porque já tinham sido enviadas antes, seja porque se
  repetem dentro do próprio lote) — `duplicates = válidas − inseridas`.
- `rejected` — leituras individualmente inválidas (`index` é a posição no
  array `readings` enviado, 0-based). O lote **nunca** é derrubado por causa
  de um item inválido — as demais leituras são processadas normalmente.

Motivos possíveis em `rejected[].reason`:

- `"<campo> out of range (min <min>, max <max>)"` — fora da faixa física.
- `"timestamp is in the future"` — timestamp mais de 5 minutos à frente do
  relógio do servidor (proteção contra relógio de estação desajustado).
- `"timestamp is invalid"` — timestamp não é uma data válida (defesa extra;
  normalmente já barrado pelo `400` estrutural abaixo).

`readings: []` é um no-op válido: responde `202 {accepted:0, duplicates:0, rejected:[]}`
sem tocar o banco.

## Outras respostas

| Status | Quando | Corpo |
| --- | --- | --- |
| `400 Bad Request` | corpo não é JSON válido, ou não bate a estrutura do contrato (`station_id` vazio, `readings` não é array, campo de tipo errado, etc.) | `{ "error": "invalid request body", "issues": [...] }` |
| `401 Unauthorized` | `X-API-Key` ausente ou incorreta | `{ "error": "unauthorized" }` |
| `413 Payload Too Large` | `readings.length` acima do limite configurado (`MAX_BATCH`, default 5000), **ou** corpo HTTP acima do limite de bytes (10MB) | `{ "error": "batch too large", "maxBatch": 5000 }` |

## Idempotência

Reenviar exatamente o mesmo lote é sempre seguro: a chave de deduplicação é
`(station_id, timestamp)`, garantida a nível de banco (`UNIQUE` + `INSERT
... ON CONFLICT DO NOTHING`). Reenvio de um lote já processado devolve
`accepted:0, duplicates:N` — o estado final no banco é idêntico, mesmo sob
requisições concorrentes com a mesma leitura.

## Exemplos `curl`

Lote de 3 leituras novas:

```bash
curl -i -X POST http://localhost:3000/api/v1/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: whs_test_ABC123" \
  -d '{
    "station_id": "main",
    "readings": [
      { "timestamp": "2026-07-23T14:30:00.000Z", "temperature_c": 24.7, "humidity_pct": 61.2, "pressure_hpa": 1013.4, "rain_mm": 0.4, "uv_index": 5.3 },
      { "timestamp": "2026-07-23T14:35:00.000Z", "temperature_c": 24.9, "humidity_pct": 60.8, "pressure_hpa": 1013.3, "rain_mm": 0.0, "uv_index": 5.1 },
      { "timestamp": "2026-07-23T14:40:00.000Z", "temperature_c": 25.1, "humidity_pct": 60.1, "pressure_hpa": 1013.2, "rain_mm": 0.0, "uv_index": 4.9 }
    ]
  }'
# 202 { "accepted": 3, "duplicates": 0, "rejected": [] }
```

Reenviar o mesmo lote (buffer offline sendo reprocessado):

```bash
# mesmo comando acima, de novo
# 202 { "accepted": 0, "duplicates": 3, "rejected": [] }
```

Sensor com leitura fora de faixa (não derruba o lote):

```bash
curl -i -X POST http://localhost:3000/api/v1/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: whs_test_ABC123" \
  -d '{
    "readings": [
      { "timestamp": "2026-07-23T15:00:00.000Z", "temperature_c": 24.0 },
      { "timestamp": "2026-07-23T15:05:00.000Z", "temperature_c": 999 }
    ]
  }'
# 202 { "accepted": 1, "duplicates": 0, "rejected": [ { "index": 1, "reason": "temperature_c out of range (min -90, max 60)" } ] }
```

Sem `X-API-Key`:

```bash
curl -i -X POST http://localhost:3000/api/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{ "readings": [] }'
# 401 { "error": "unauthorized" }
```

Lote vazio (no-op — útil para "heartbeat" de conectividade sem dados):

```bash
curl -i -X POST http://localhost:3000/api/v1/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: whs_test_ABC123" \
  -d '{ "readings": [] }'
# 202 { "accepted": 0, "duplicates": 0, "rejected": [] }
```

## Política de retry/buffer recomendada para o firmware da estação

1. **Buffer local primeiro**: grave cada leitura localmente (com `timestamp`
   da captura, não do envio) antes de tentar transmitir. Nunca descarte uma
   leitura só por falha de rede.
2. **Envie em lote**, não uma leitura por request — acumule o buffer offline
   e envie tudo de uma vez ao reconectar (até `MAX_BATCH` itens por
   request; se o buffer for maior, particione em múltiplas chamadas).
3. **Trate a resposta, não só o status HTTP**: com `202`, remova do buffer
   local exatamente as leituras cobertas por `accepted + duplicates`
   (idempotência garante que ambas já estão safe no servidor). Para os
   itens em `rejected[]`, decida por política local (descartar após log, ou
   reter por N tentativas — nunca reenviar infinitamente um item já
   rejeitado por faixa física, pois o motivo não muda sozinho).
4. **Backoff exponencial em falha de transporte** (timeout, `5xx`, sem
   rede): não reenvie imediatamente em loop apertado. Ex.: 1s, 2s, 4s, 8s...
   até um teto (ex.: 5min), mantendo o buffer intacto entre tentativas.
5. **`401` não é transitório**: pare de tentar e sinalize erro de
   configuração (chave errada/expirada) em vez de fazer retry — retry não
   resolve autenticação inválida.
6. **`400`/`413` indicam bug de payload/lote grande demais**: reduza o
   tamanho do lote (particione) em vez de repetir a mesma requisição.
7. **Relógio da estação**: sincronize via NTP quando possível — leituras
   com `timestamp` mais de 5 minutos no futuro (relativo ao servidor) são
   rejeitadas (`"timestamp is in the future"`), pois normalmente indicam
   relógio local desajustado.

## Variáveis de ambiente relacionadas

| Variável | Default | Descrição |
| --- | --- | --- |
| `INGEST_API_KEY` | — (obrigatória) | segredo comparado ao header `X-API-Key` (tempo constante) |
| `MAX_BATCH` | `5000` | teto de leituras por lote antes de responder `413` |

Ver `.env.example` (raiz do repo) para todos os valores/defaults.
