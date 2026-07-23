# F8 · Página de histórico + exportação (CSV/XLSX) — Specification

## Problem Statement

O dashboard mostra o "agora" e tendências agregadas, mas o usuário às vezes precisa investigar os dados brutos, leitura a leitura, num intervalo específico — e levá-los para fora (planilha). Precisamos de uma página de histórico detalhado com filtro por data, paginação e exportação em CSV e XLSX.

## Goals

- [ ] Listar leituras brutas por intervalo de datas, paginadas e ordenadas por tempo.
- [ ] Exportar o intervalo filtrado inteiro em CSV e em XLSX (server-side).
- [ ] Página fiel ao design, reusando o design system (F5).

## Out of Scope

| Feature | Reason |
| --- | --- |
| Gráficos (é do dashboard) | F6 |
| Edição/remoção de leituras | Dados são imutáveis (append-only) |
| Agendamento de export por e-mail | v2 |
| Filtro por valor de sensor (ex.: temp > 30) | v2 (só intervalo de datas no v1) |

---

## User Stories

### P1: Ver leituras brutas por intervalo ⭐ MVP

**User Story**: Como usuário, quero listar as leituras de um período escolhido para investigar os dados em detalhe.

**Why P1**: É o núcleo da página de histórico.

**Acceptance Criteria**:

1. WHEN abro `/historico` e escolho um intervalo (`from`/`to`) THEN o sistema SHALL listar as leituras daquele intervalo, paginadas, com `timestamp` + os 5 sensores.
2. WHEN há mais leituras que uma página THEN SHALL paginar (próxima/anterior; tamanho de página configurável).
3. WHEN um sensor é `null` naquela leitura THEN a célula SHALL mostrar "—".
4. WHEN o intervalo não tem dados THEN SHALL mostrar estado vazio (não erro).
5. WHEN nenhum intervalo é escolhido THEN SHALL usar um default (ex.: últimas 24h).

**Independent Test**: ingerir leituras; abrir histórico com intervalo → tabela lista as leituras corretas, paginadas.

---

### P1: Exportar em CSV e XLSX ⭐ MVP

**User Story**: Como usuário, quero baixar os dados do intervalo filtrado em CSV ou XLSX para analisar em outra ferramenta.

**Why P1**: Pedido explícito; principal diferencial da página.

**Acceptance Criteria**:

1. WHEN clico "Exportar CSV" THEN o sistema SHALL baixar um `.csv` com **todas** as leituras do intervalo filtrado (não só a página atual), com cabeçalho e colunas timestamp + 5 sensores.
2. WHEN clico "Exportar XLSX" THEN o sistema SHALL baixar um `.xlsx` equivalente, com cabeçalho formatado.
3. WHEN o export ocorre THEN os `timestamp` SHALL estar em ISO 8601 UTC (coluna dedicada), e valores nulos ficam vazios.
4. WHEN o intervalo é grande THEN o export SHALL ser gerado por streaming (sem estourar memória).
5. WHEN o intervalo está vazio THEN o arquivo SHALL conter apenas o cabeçalho.

**Independent Test**: exportar um intervalo conhecido → arquivo abre no Excel/planilha com as linhas esperadas.

---

## Edge Cases

- WHEN `from` > `to` THEN `400` (intervalo inválido).
- WHEN `from`/`to` não são datas ISO válidas THEN `400`.
- WHEN o intervalo excede um limite máximo (ex.: 366 dias) THEN `400` ou clamp — decidir em design.
- WHEN `format` de export não é `csv`/`xlsx` THEN `400`.
- WHEN muitíssimas linhas THEN streaming + nome de arquivo com intervalo (`readings_2026-07-01_2026-07-23.csv`).
- WHEN fuso do usuário THEN tabela exibe em fuso local; export mantém coluna UTC (fonte da verdade).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| HIST-01 | P1: listagem por intervalo | Design | Pending |
| HIST-02 | P1: paginação | Design | Pending |
| HIST-03 | P1: célula nula = "—" | Design | Pending |
| HIST-04 | P1: estado vazio | Design | Pending |
| HIST-05 | P1: default últimas 24h | Design | Pending |
| HIST-06 | P1: export CSV (intervalo inteiro) | Design | Pending |
| HIST-07 | P1: export XLSX (intervalo inteiro) | Design | Pending |
| HIST-08 | P1: timestamps UTC + nulos vazios no export | Design | Pending |
| HIST-09 | P1: export por streaming | Design | Pending |
| HIST-10 | Edge: validações de intervalo/format → 400 | Design | Pending |

---

## Success Criteria

- [ ] Listagem paginada correta e rápida (usa índice de F2).
- [ ] CSV e XLSX abrem corretamente e refletem exatamente o intervalo filtrado.
- [ ] Testes de integração (endpoints) + componente (página) ≥80%; E2E do export em F7.
