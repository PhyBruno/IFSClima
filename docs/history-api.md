# `GET /api/v1/readings` e `GET /api/v1/readings/export` — Histórico e exportação (F8)

Endpoints para investigar os dados brutos da estação (leitura a leitura) num
intervalo de datas escolhido: listagem paginada para a página `/historico` e
exportação do intervalo inteiro em CSV ou XLSX.

> Implementação: `api/src/routes/history.ts` → `api/src/services/history-service.ts`
> → `api/src/repositories/reading-repository.ts` (`findRange`/`streamRange`)
> → `api/src/exporters/{csv,xlsx}.ts`. Contrato estrutural (Zod):
> `api/src/schemas/history.ts`. Testes: `api/test/routes/history.test.ts`,
> `api/test/services/history-service.test.ts`,
> `api/test/repositories/reading-repository.test.ts`,
> `api/test/exporters/{csv,xlsx}.test.ts`, `api/test/schemas/history.test.ts`.

Ambas as rotas são **públicas** (sem `X-API-Key` — D2, mesmo padrão de
`GET /api/v1/readings/latest` e `/series`) e só leem dados; nunca modificam o
banco.

## Autenticação

Nenhuma. Ver `docs/ingest-api.md` para o único endpoint autenticado da API
(`POST /api/v1/ingest`).

## `GET /api/v1/readings` — listagem paginada

### Query string

| Parâmetro | Tipo | Default | Notas |
| --- | --- | --- | --- |
| `from` | string ISO 8601 (UTC, aceita offset) | `to − 24h` (ou `now − 24h` se `to` também ausente) | início do intervalo (inclusive) |
| `to` | string ISO 8601 (UTC, aceita offset) | `now` | fim do intervalo (inclusive) |
| `page` | inteiro ≥ 1 | `1` | página (1-based) |
| `page_size` | inteiro ≥ 1 | `50` | máx **500** |
| `order` | `asc` \| `desc` | `desc` | ordenação por `timestamp` |

Regras de validação (HIST-10): quando **ambos** `from` e `to` são informados,
`from` deve ser ≤ `to`, e o intervalo entre eles não pode exceder **366
dias**. Informar só um dos dois é válido — o outro cai no default de "últimas
24h" (HIST-05).

### Response — `200 OK`

```jsonc
{
  "from": "2026-07-22T14:30:00.000Z",
  "to":   "2026-07-23T14:30:00.000Z",
  "page": 1,
  "page_size": 50,
  "total": 1440,
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

- `total` é a contagem de leituras em **todo** o intervalo (não só a página
  atual) — usado pelo front para calcular o número de páginas.
- `readings` vem ordenado por `timestamp` conforme `order`.
- Um sensor ausente naquela leitura aparece como `null` (a UI decide como
  exibir — ex.: "—", HIST-03); intervalo sem nenhuma leitura retorna `200`
  com `total: 0, readings: []` (estado vazio, nunca erro — HIST-04).
- Header `Cache-Control: no-store` (mesmo padrão de `/readings/latest` e
  `/series` — dataset pequeno, sem cache no v1).

## `GET /api/v1/readings/export` — exportação (CSV/XLSX)

### Query string

| Parâmetro | Tipo | Default | Notas |
| --- | --- | --- | --- |
| `from` | string ISO 8601 | `to − 24h`/`now − 24h` | mesma regra de `/readings` |
| `to` | string ISO 8601 | `now` | mesma regra de `/readings` |
| `format` | `csv` \| `xlsx` | `csv` | formato do arquivo |

Sem paginação: o export sempre baixa **o intervalo filtrado inteiro**, gerado
por streaming (nunca materializa o arquivo inteiro em memória — HIST-09),
ordenado por `timestamp` ascendente.

### Response — `200 OK`

Headers:

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="readings_2026-07-22_2026-07-23.csv"
Cache-Control: no-store
```

(ou `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
e `filename="....xlsx"` para `format=xlsx`).

O nome do arquivo usa as datas do intervalo (`from`/`to` já resolvidos, com
default aplicado) no formato `YYYY-MM-DD`.

**CSV** — cabeçalho + uma linha por leitura, separador `,`, `timestamp` em
ISO 8601 UTC, sensor nulo vira célula vazia (HIST-08):

```csv
timestamp,temperature_c,humidity_pct,pressure_hpa,rain_mm,uv_index
2026-07-23T14:30:00.000Z,24.7,61.2,1013.4,0.4,5.3
2026-07-23T14:35:00.000Z,24.9,,1013.3,0.0,5.1
```

**XLSX** — planilha única `Leituras`, mesma ordem de colunas, cabeçalho em
negrito, `timestamp` na mesma coluna ISO 8601 UTC, sensor nulo vira célula
vazia. Gerado com `exceljs` em modo streaming (`WorkbookWriter`).

Intervalo sem nenhuma leitura → arquivo válido contendo só o cabeçalho
(HIST-08) — nunca erro.

## Outras respostas

| Status | Quando | Corpo |
| --- | --- | --- |
| `400 Bad Request` | `from` > `to`; intervalo > 366 dias; `from`/`to` não são ISO 8601 válidos; `page`/`page_size` fora da faixa; `format` diferente de `csv`/`xlsx` | `{ "error": "invalid query", "issues": [{ "path": "...", "message": "..." }] }` |

`issues[].path` aponta o campo da query que falhou (ex.: `"to"` quando
`from > to`, `"page_size"` quando acima de 500).

## Exemplos `curl`

Listagem paginada de um intervalo:

```bash
curl -s "http://localhost:3000/api/v1/readings?from=2026-07-22T00:00:00.000Z&to=2026-07-23T00:00:00.000Z&page=1&page_size=50&order=asc"
```

Sem `from`/`to` (default: últimas 24h):

```bash
curl -s "http://localhost:3000/api/v1/readings"
```

Exportar CSV do intervalo filtrado:

```bash
curl -s -OJ "http://localhost:3000/api/v1/readings/export?from=2026-07-01T00:00:00.000Z&to=2026-07-23T00:00:00.000Z&format=csv"
# salva readings_2026-07-01_2026-07-23.csv (Content-Disposition)
```

Exportar XLSX:

```bash
curl -s -OJ "http://localhost:3000/api/v1/readings/export?from=2026-07-01T00:00:00.000Z&to=2026-07-23T00:00:00.000Z&format=xlsx"
```

`from > to` (erro de validação):

```bash
curl -i "http://localhost:3000/api/v1/readings?from=2026-07-23T00:00:00.000Z&to=2026-07-01T00:00:00.000Z"
# 400 { "error": "invalid query", "issues": [{ "path": "to", "message": "'to' deve ser maior ou igual a 'from'" }] }
```

Intervalo maior que 366 dias:

```bash
curl -i "http://localhost:3000/api/v1/readings?from=2020-01-01T00:00:00.000Z&to=2026-07-23T00:00:00.000Z"
# 400 { "error": "invalid query", "issues": [{ "path": "to", "message": "intervalo entre 'from' e 'to' não pode exceder 366 dias" }] }
```

## Notas de implementação

- `findRange` (listagem) usa offset/limit + `COUNT(*)`, apoiado no índice
  `readings_station_id_timestamp_idx` (`station_id`, `timestamp DESC`).
- `streamRange` (export) usa **keyset pagination** por `(timestamp, id)` em
  chunks internos (`STREAM_CHUNK_SIZE`), em vez de um único `SELECT` sem
  `LIMIT` para o intervalo inteiro — evita OFFSET grande e nunca materializa
  o intervalo inteiro em memória, mesmo para exports de muitas leituras
  (HIST-09).
- Export = intervalo filtrado, ignora paginação (o usuário espera "tudo que
  filtrei", não só a página atual — HIST-06/HIST-07).
