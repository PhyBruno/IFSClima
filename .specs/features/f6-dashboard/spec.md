# F6 · Dashboard responsivo — Specification

## Problem Statement

O usuário precisa ver os dados da estação. Precisamos da página do dashboard que consome a API de leitura (F4), usa o design system (F5) e apresenta os sensores em tempo (quase) real e em histórico, de forma fiel ao design e responsiva em desktop e mobile.

## Goals

- [x] Página única com cards por sensor (leitura atual) + gráficos históricos.
- [x] Seletor de período (24h/7d/30d) que atualiza os gráficos.
- [x] Atualização automática (polling) e responsividade total.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Componentes base | É F5 |
| Endpoints | É F4 |
| Login | Público (D2) |
| Multi-estação/seletor de estação | v2 (D3) |

---

## User Stories

### P1: Ver a leitura atual de todos os sensores ⭐ MVP

**User Story**: Como usuário, quero abrir o site e ver imediatamente temperatura, umidade, pressão, chuva e UV atuais.

**Why P1**: É o valor central do produto.

**Acceptance Criteria**:

1. WHEN abro o dashboard THEN o sistema SHALL exibir 5 cards (temperatura, umidade, pressão, chuva, UV) com o valor atual (de `GET /latest`) e unidade.
2. WHEN um sensor está sem dado THEN o card SHALL mostrar "—" (sem quebrar).
3. WHEN a última leitura foi há X THEN SHALL exibir "atualizado há X" (de `age_seconds`).
4. WHEN não há nenhuma leitura ainda THEN SHALL exibir estado vazio amigável (não erro).

**Independent Test**: com API populada, os 5 cards mostram os valores da última leitura.

---

### P1: Ver histórico em gráficos com seletor de período ⭐ MVP

**User Story**: Como usuário, quero ver a evolução de cada métrica em 24h/7d/30d.

**Acceptance Criteria**:

1. WHEN seleciono um período (24h/7d/30d) THEN os gráficos SHALL recarregar com os buckets de `GET /series`.
2. WHEN um gráfico carrega THEN SHALL desenhar a série (avg) com min/max quando fizer sentido, no estilo do design.
3. WHEN chuva (`rain_mm`) é exibida THEN SHALL usar a agregação `sum` (barras de precipitação).
4. WHEN o período não tem dados THEN o gráfico SHALL mostrar estado vazio.

**Independent Test**: trocar de 24h→7d→30d recarrega e redesenha os gráficos.

---

### P2: Atualização automática e responsividade

**User Story**: Como usuário, quero que os dados atualizem sozinhos e o layout funcione no celular.

**Acceptance Criteria**:

1. WHEN a página está aberta THEN SHALL fazer polling do `latest` (ex.: a cada 60s) e atualizar os cards.
2. WHEN em viewport mobile THEN cards e gráficos SHALL empilhar e permanecer legíveis.
3. WHEN há erro de rede THEN SHALL manter o último dado e sinalizar "offline/reconectando" (sem tela branca).

---

## Edge Cases

- WHEN a API está fora THEN mostrar último dado + aviso, retry com backoff.
- WHEN loading inicial THEN skeletons (não layout shift).
- WHEN valores extremos (ex.: UV 11+) THEN destacar sem quebrar escala.
- WHEN fuso do usuário THEN eixos/tempos formatados no fuso local a partir de UTC.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| UI-01 | P1: 5 cards com valor atual | Done | Done |
| UI-02 | P1: estado nulo por card | Done | Done |
| UI-03 | P1: "atualizado há X" | Done | Done |
| UI-04 | P1: estado vazio global | Done | Done |
| UI-05 | P1: gráficos por métrica | Done | Done |
| UI-06 | P1: seletor de período recarrega | Done | Done |
| UI-07 | P1: chuva como barras (sum) | Done | Done |
| UI-08 | P2: polling do latest | Done | Done |
| UI-09 | P2: responsividade mobile | Done | Done |
| UI-10 | P2: resiliência a erro de rede | Done | Done |

---

## Success Criteria

- [x] Dashboard fiel ao design, responsivo, com cards + gráficos funcionais.
- [x] Consome F4 corretamente; estados de loading/erro/vazio tratados.
- [x] Testes de componente/integração (RTL + MSW) ≥80%.
