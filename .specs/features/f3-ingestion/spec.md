# F3 · Endpoint de ingestão `POST /api/v1/ingest` — Specification

## Problem Statement

A estação captura leituras in loco e precisa entregá-las à plataforma por um único ponto de entrada, mesmo quando a rede falha e ela acumula dados localmente. Precisamos de um endpoint que autentique a estação, valide o lote, persista de forma idempotente e responda com um resumo claro do que foi aceito/duplicado/rejeitado. Este é o coração do sistema.

## Goals

- [ ] Aceitar lotes de leituras com idempotência total (reenvio nunca duplica).
- [ ] Autenticar a origem via `X-API-Key`; rejeitar sem vazar informação.
- [ ] Validar rigorosamente cada leitura; rejeição por item, sem derrubar o lote.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Endpoints de leitura do dashboard | É F4 |
| Rate limiting avançado / quota | v2 (básico pode entrar em F7) |
| Múltiplas API keys por estação | v2 |
| Webhook/ack assíncrono | Resposta é síncrona (202) |

---

## User Stories

### P1: Estação envia lote e recebe confirmação ⭐ MVP

**User Story**: Como estação meteorológica, quero enviar um lote de leituras em um POST e receber a confirmação de quantas foram aceitas, para saber o que posso descartar do meu buffer local.

**Why P1**: É o fluxo primário; sem ele não há dados no sistema.

**Acceptance Criteria**:

1. WHEN recebo `POST /api/v1/ingest` com `X-API-Key` válida e body válido THEN o sistema SHALL persistir as leituras novas e responder `202 { accepted, duplicates, rejected[] }`.
2. WHEN o lote contém leituras já persistidas `(station_id, timestamp)` THEN o sistema SHALL ignorá-las (contando em `duplicates`) e persistir apenas as novas.
3. WHEN reenvio exatamente o mesmo lote THEN o resultado final no banco SHALL ser idêntico (idempotência), com `accepted:0, duplicates:N`.
4. WHEN uma leitura individual é inválida THEN o sistema SHALL rejeitá-la em `rejected[]` (com motivo) e ainda persistir as válidas do mesmo lote.

**Independent Test**: POST de 3 leituras → `accepted:3`. Repetir → `duplicates:3`. POST com 1 inválida entre 2 válidas → `accepted:2, rejected:[1]`.

---

### P1: Autenticação da estação ⭐ MVP

**User Story**: Como operador, quero que só a minha estação (com a chave secreta) consiga inserir dados, para o dashboard público não ser poluído por terceiros.

**Why P1**: Dashboard é público (D2); a ingestão precisa ser fechada (D7).

**Acceptance Criteria**:

1. WHEN `X-API-Key` ausente ou inválida THEN o sistema SHALL responder `401` sem persistir nada e sem revelar detalhes.
2. WHEN a chave é válida THEN SHALL prosseguir. A chave vem de env (`INGEST_API_KEY`), nunca hardcoded.
3. WHEN a comparação de chave ocorre THEN SHALL usar comparação de tempo constante (evitar timing attack).

**Independent Test**: POST sem header → 401. Com header errado → 401. Com header certo → 202.

---

### P2: Validação de contrato robusta

**User Story**: Como sistema, quero validar estrutura e faixas dos valores para não persistir lixo.

**Acceptance Criteria**:

1. WHEN o body não bate o schema (Zod) THEN SHALL responder `400` com erros estruturados.
2. WHEN um valor de sensor está fora da faixa física THEN a leitura SHALL ir para `rejected[]` com o motivo.
3. WHEN `timestamp` não é ISO 8601 válido THEN a leitura SHALL ser rejeitada.
4. WHEN o lote excede o tamanho máximo (ex.: 5000 leituras) THEN SHALL responder `413`.

---

## Edge Cases

- WHEN `readings` é `[]` THEN responder `202 {accepted:0,duplicates:0,rejected:[]}` (no-op válido).
- WHEN há duplicatas *dentro do mesmo lote* THEN persistir uma, contar as demais como `duplicates`.
- WHEN `station_id` não existe THEN criar/garantir a estação (upsert) OU rejeitar — decisão em design.md.
- WHEN `timestamp` é futuro (> agora + tolerância) THEN rejeitar (clock inválido).
- WHEN body não é JSON THEN `400`.
- WHEN duas requisições concorrentes trazem a mesma leitura THEN o `ON CONFLICT DO NOTHING` garante uma só (sem erro 500).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| ING-01 | P1: persiste lote + resposta 202 | Design | Pending |
| ING-02 | P1: idempotência (dedupe por chave) | Design | Pending |
| ING-03 | P1: rejeição por item sem derrubar lote | Design | Pending |
| ING-04 | P1: 401 sem chave / chave inválida | Design | Pending |
| ING-05 | P1: comparação de chave tempo-constante | Design | Pending |
| ING-06 | P2: validação Zod → 400 estruturado | Design | Pending |
| ING-07 | P2: faixas físicas → rejected[] | Design | Pending |
| ING-08 | P2: limite de tamanho de lote → 413 | Design | Pending |
| ING-09 | Edge: dedupe intra-lote | Design | Pending |
| ING-10 | Edge: timestamp futuro rejeitado | Design | Pending |

---

## Success Criteria

- [ ] Reenvio do mesmo lote é idempotente (verificado por teste de integração).
- [ ] Cobertura ≥80%, incluindo todos os edge cases acima.
- [ ] Nenhuma leitura inválida chega ao banco.
