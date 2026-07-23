# F4 · Endpoints de leitura para o dashboard — Specification

## Problem Statement

O dashboard precisa de dados: o valor atual de cada sensor e séries históricas para os gráficos (24h/7d/30d). Precisamos de endpoints de leitura, públicos, rápidos e com contratos tipados, que sirvam esses dados a partir do que a ingestão (F3) persistiu.

## Goals

- [ ] Expor a leitura mais recente de todos os sensores num único request.
- [ ] Expor séries temporais agregadas por período (24h/7d/30d) com bucketing.
- [ ] Contratos tipados (Zod) e respostas eficientes (usam índices de F2).

## Out of Scope

| Feature | Reason |
| --- | --- |
| Ingestão | É F3 |
| Autenticação (endpoints são públicos) | D2 |
| Websockets/streaming em tempo real | v2 (dashboard faz polling) |
| Exportação CSV/XLSX + histórico detalhado | É F8 |

---

## User Stories

### P1: Leitura atual de todos os sensores ⭐ MVP

**User Story**: Como dashboard, quero a última leitura de cada métrica para preencher os cards de "agora".

**Why P1**: É o primeiro dado que o usuário vê ao abrir a página.

**Acceptance Criteria**:

1. WHEN chamo `GET /api/v1/readings/latest` THEN o sistema SHALL retornar a leitura mais recente da estação com `timestamp` e todos os sensores.
2. WHEN um sensor não tem valor na última leitura THEN o campo SHALL vir `null` (não omitido).
3. WHEN não há nenhuma leitura THEN o sistema SHALL retornar `200` com `{ station_id, timestamp: null, ... todos null }` (estado vazio, não 404).
4. WHEN há dados THEN a resposta SHALL incluir há quanto tempo foi a leitura (para o dashboard mostrar "atualizado há X").

**Independent Test**: ingerir 2 leituras → `latest` retorna a de `timestamp` maior.

---

### P1: Séries agregadas por período ⭐ MVP

**User Story**: Como dashboard, quero uma série temporal agregada de uma métrica num período (24h/7d/30d) para desenhar o gráfico.

**Why P1**: Gráficos são metade do valor do dashboard.

**Acceptance Criteria**:

1. WHEN chamo `GET /api/v1/readings/series?metric=temperature_c&range=24h` THEN o sistema SHALL retornar buckets por hora com `avg`, `min`, `max`.
2. WHEN `range=7d` ou `range=30d` THEN os buckets SHALL ser por dia (ou hora p/ 7d — definido em design), com `avg/min/max`.
3. WHEN `metric` é inválida THEN SHALL responder `400`.
4. WHEN não há dados no período THEN SHALL responder `200` com `buckets: []`.
5. WHEN há buckets sem leitura no meio do período THEN SHALL representar lacuna (bucket ausente ou `null`) — sem inventar dados.

**Independent Test**: ingerir leituras espaçadas → série retorna buckets agregados corretos.

---

## Edge Cases

- WHEN `range` é inválido (não 24h/7d/30d) THEN `400`.
- WHEN `metric` não é uma das 5 permitidas THEN `400`.
- WHEN o timezone do bucket THEN agregação é feita em UTC; o dashboard formata para o fuso local.
- WHEN há muitos pontos (30d por hora = 720) THEN resposta continua leve (só agregados).
- WHEN `rain_mm` é agregado THEN além de avg/min/max, expor `sum` (chuva acumulada faz mais sentido somada) — ver design.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| READ-01 | P1: latest retorna última leitura | Design | Pending |
| READ-02 | P1: sensores ausentes = null | Design | Pending |
| READ-03 | P1: estado vazio = 200 (não 404) | Design | Pending |
| READ-04 | P1: idade da leitura na resposta | Design | Pending |
| READ-05 | P1: series buckets avg/min/max | Design | Pending |
| READ-06 | P1: bucketing por range (hora/dia) | Design | Pending |
| READ-07 | P2: metric/range inválidos → 400 | Design | Pending |
| READ-08 | P1: período vazio → 200 buckets:[] | Design | Pending |
| READ-09 | Edge: lacunas não inventam dados | Design | Pending |
| READ-10 | Edge: rain_mm agrega sum | Design | Pending |

---

## Success Criteria

- [ ] `latest` e `series` respondem < 100ms em dataset de 30 dias (1 leitura/min).
- [ ] Contratos validados por Zod; testes de integração com dados reais de F3.
- [ ] Nenhum dado inventado em lacunas.
