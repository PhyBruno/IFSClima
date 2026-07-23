# F5 · Extração do design + design system — Specification

## Problem Statement

O design foi entregue como `Estacao Meteorologica (standalone).html` (página bundled). Antes de construir o dashboard, precisamos extrair fielmente os tokens (cores, tipografia, espaçamento, raios, sombras) e o vocabulário de componentes desse design, materializando-os num design system reutilizável (Tailwind + componentes base), para que F6 seja construído com fidelidade e consistência.

## Goals

- [ ] Extrair tokens exatos do design bundled e registrá-los (Tailwind theme + CSS vars).
- [ ] Biblioteca de componentes base (Card, StatCard, Chart wrapper, PeriodSelector, etc.) testada.
- [ ] Tema escuro fiel ao original, responsivo (mobile-first).

## Out of Scope

| Feature | Reason |
| --- | --- |
| Montagem do dashboard final | É F6 |
| Consumo da API | É F6 |
| Tema claro | Design é dark; claro é v2 |

---

## User Stories

### P1: Tokens de design extraídos e fiéis ⭐ MVP

**User Story**: Como time de UI, quero os tokens exatos do design original para não "adivinhar" cores/espaçamentos ao montar telas.

**Why P1**: Fidelidade ao design é constraint; tokens são a base.

**Acceptance Criteria**:

1. WHEN o design bundled é processado THEN o sistema SHALL produzir um `tokens` (cores, tipografia, spacing, radius, shadow) documentado e aplicado no `tailwind.config`.
2. WHEN comparo um componente renderizado com o original THEN as cores/tipografia SHALL bater (verificação visual).
3. WHEN um token muda THEN SHALL propagar via CSS vars/theme (fonte única).

**Independent Test**: renderizar um StatCard isolado (Storybook/rota de demo) e comparar visualmente com o card do HTML original.

---

### P1: Componentes base testados ⭐ MVP

**User Story**: Como dev de F6, quero componentes prontos (Card, StatCard, ChartCard, PeriodSelector, StatusPill) para compor o dashboard rapidamente.

**Acceptance Criteria**:

1. WHEN uso `<StatCard sensor="temperature" value={24.7} unit="°C" />` THEN SHALL renderizar no estilo do design (ícone, cor de acento, valor, label).
2. WHEN um valor é `null` THEN o componente SHALL mostrar estado "—" / sem dado (não quebra).
3. WHEN a viewport é mobile THEN os componentes SHALL se adaptar (grid responsivo).

**Independent Test**: testes RTL de cada componente (render, props, estado nulo, acessibilidade).

---

## Edge Cases

- WHEN um valor de sensor é `null`/ausente THEN mostrar placeholder, sem NaN.
- WHEN o texto do valor é longo THEN não quebrar layout do card.
- WHEN em mobile estreito THEN cards empilham 1 coluna; desktop em grid.
- WHEN prefers-reduced-motion THEN animações reduzidas (a11y).

---

## Design tokens observados (a confirmar na extração)

- **Superfícies:** fundo `#0d1117` / `#12161d`; cards `#161b22` / `#1e232b`; bordas `#262c35`.
- **Texto:** primário `#f3f4f6`; secundário `#9ca3af` / `#6b7280`.
- **Acentos por sensor:** temperatura `#f97316`, umidade `#0ea5e9`, pressão `#3b82f6`/`#14b8a6`, UV `#a855f7`, positivo/ok `#16a34a`/`#4ade80`.
- **Tipografia:** system UI (a confirmar família exata no bundle).

> A extração real (fonte da verdade) é feita por subagent parseando o `<script type="__bundler/template">` do HTML; os valores acima são o ponto de partida.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DS-01 | P1: tokens extraídos → tailwind theme | Tasks | Pending |
| DS-02 | P1: fidelidade visual de cor/tipo | Tasks | Pending |
| DS-03 | P1: componentes base testados (RTL) | Tasks | Pending |
| DS-04 | P1: estado nulo nos componentes | Tasks | Pending |
| DS-05 | P1: responsividade mobile-first | Tasks | Pending |
| DS-06 | a11y: contraste + reduced-motion | Tasks | Pending |

---

## Tasks (inline — feature Medium/Large)

> Extração e UI via subagent + `ui-ux-pro-max`. Revisão `ecc:react-reviewer` + `ecc:a11y-architect`. TDD (RTL) nos componentes.

- **T5.1 — Extrair design do bundle (subagent + ui-ux-pro-max)**
  What: subagent parseia o `<script type="__bundler/template">` do `Estacao Meteorologica (standalone).html`, decodifica o layout, extrai tokens e inventário de componentes/telas. Produz `docs/design-extraction.md` + screenshot de referência.
  Done when: tokens e estrutura documentados e batendo com o original.
  Traceability: DS-01, DS-02.

- **T5.2 — Tailwind theme + CSS vars (tokens)** (depends: T5.1)
  What: `tailwind.config`, `theme.css` (vars), mapeamento de cores de acento por sensor.
  Tests: teste de smoke que classes/tokens resolvem; snapshot de tokens.
  Traceability: DS-01.

- **T5.3 — Componentes base (TDD/RTL)** (depends: T5.2) `[P por componente]`
  What: `Card`, `StatCard` (por sensor), `ChartCard`, `PeriodSelector` (24h/7d/30d), `StatusPill`, `EmptyState`.
  Tests: render, props, estado nulo, a11y (roles/labels), responsividade.
  Traceability: DS-03, DS-04, DS-05, DS-06.

- **T5.4 — Rota/página de demo (galeria de componentes)** (depends: T5.3)
  What: `/__ui` que renderiza todos os componentes p/ comparação visual com o original.
  Done when: comparável lado a lado com o HTML de design.
  Traceability: DS-02.

## Success Criteria

- [ ] Tokens fiéis ao design original, centralizados.
- [ ] Todos os componentes base com testes RTL verdes e acessíveis.
- [ ] Galeria de demo comparável ao design entregue.
