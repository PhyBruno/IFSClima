# Extração do Design — `Estacao Meteorologica (standalone).html`

> T5.1 (F5 · Design System). Fonte: `Estacao Meteorologica (standalone).html` (raiz do repo).
> Método: o arquivo é uma página **bundled** — o design real vive dentro de
> `<script type="__bundler/template">` (string JSON com HTML/CSS + placeholders de asset).
> Em vez de reimplementar a decodificação lendo o texto manualmente, a página foi **renderizada
> de verdade num Chromium headless (Playwright)**, que é o próprio mecanismo que decodifica o
> bundle e monta o DOM. Os tokens abaixo vêm de:
> 1. Leitura do DOM final renderizado (`page.content()`), onde os elementos têm estilos **inline**
>    (`style="..."`) escritos pelo próprio script do template — ou seja, já são os valores exatos
>    usados para renderizar, não uma reconstrução aproximada.
> 2. `page.evaluate(() => getComputedStyle(...))` sobre elementos-chave, para confirmar que o
>    computed style bate exatamente com o inline (confirmado — ver seção "Verificação").
> 3. Um bloco `<script type="text/x-dc" data-dc-script>` embutido no fim do template contém a
>    **lógica-fonte** que gera o mock (definições de sensor com cor/ícone/formatação) — usado como
>    confirmação adicional dos tokens de acento por sensor.
>
> Nenhum valor abaixo foi "adivinhado" por leitura de texto sem render; onde alguma informação
> não pôde ser confirmada por render (ex.: variante dark de certos estados do sistema), isso está
> **explicitamente marcado** como inferido.

Screenshot de referência (full-page, todas as variantes): `docs/design-reference.png`.

---

## 0. O que a página contém

A página é uma tela de "design canvas" (`data_doc_mode="canvas"`) que mostra, lado a lado, **8
mockups** de duas telas do produto em 2 breakpoints × 2 temas, mais uma galeria de "Estados do
sistema":

| Tela | Mobile · Light | Mobile · Dark | Desktop · Light | Desktop · Dark |
|---|---|---|---|---|
| **Dashboard** | ✓ | ✓ | ✓ | ✓ |
| **Histórico** | ✓ | ✓ | ✓ | ✓ |

Mais uma seção **"Estados do sistema"** com 5 swatches (light-only): date range picker, skeleton
de carregamento, card de sensor offline, tabela em estado vazio, banner de estação offline.

Conforme `.specs/features/f5-design-system/spec.md` ("Tema claro; claro é v2"), **este documento
foca no tema escuro** (dark), que é o único em escopo do v1. As variantes light foram inspecionadas
apenas para contexto (ex.: confirmar as cores de fundo por sensor, `bg` no script de lógica) e
estão citadas onde relevante.

O canvas em si (fundo bege-claro `#eef0f2`, rótulos "Mobile · Dashboard (dark mode)" etc.) é
**metadado de apresentação do arquivo de design**, não faz parte da UI real do produto — não deve
ser confundido com token de produto.

---

## 1. Tokens de cor

### 1.1 Superfícies (dark)

| Token proposto | Hex | rgb() observado | Onde aparece |
|---|---|---|---|
| `surface.page` | `#0d1117` | `rgb(13,17,23)` | fundo do container "janela" (dashboard e histórico, desktop e mobile) |
| `surface.sidebar` / `surface.panel` | `#12161d` | `rgb(18,22,29)` | sidebar desktop; card dashed de estado offline |
| `surface.card` | `#161b22` | `rgb(22,27,34)` | StatCard, ChartCard, tabela, painel de status, pills inativos, botão de dropdown |
| `surface.chip` / `surface.iconBg` | `#1c2129` | `rgb(28,33,41)` | fundo do círculo/quadrado de ícone dentro do StatCard |

### 1.2 Bordas (dark)

| Token proposto | Hex | rgb() | Uso |
|---|---|---|---|
| `border.default` | `#262c35` | `rgb(38,44,53)` | borda de cards, tabela, pills, botão dropdown, sidebar (border-right) |
| `border.subtle` | `#1e232b` | `rgb(30,35,43)` | divisor entre linhas da tabela; divisor abaixo do brand na sidebar |
| `border.dashed` | `#2a313c` | `rgb(42,49,60)` | borda tracejada do card "sem dado" (sensor offline) |

### 1.3 Texto (dark)

| Token proposto | Hex | rgb() | Uso |
|---|---|---|---|
| `text.primary` | `#f3f4f6` | `rgb(243,244,246)` | valores grandes, títulos de página/cards, brand |
| `text.secondary` | `#d1d5db` | `rgb(209,213,219)` | texto do botão "Últimas 24h ▾" |
| `text.tertiary` | `#9ca3af` | `rgb(156,163,175)` | labels de sensor, item de nav inativo (texto), pill inativo, dias da semana do calendário |
| `text.muted` | `#6b7280` | `rgb(107,114,128)` | unidade ao lado do valor, subtítulo, "Atualizado há...", item de nav inativo (ícone) |
| `text.faint` | `#4b5563` | `rgb(75,85,99)` | labels de eixo dos mini-gráficos (`07:00`, `14:00`) |
| `text.disabled` | `#3f4854` | `rgb(63,72,84)` | texto secundário do card dashed ("Última leitura há 3h") |

### 1.4 Acentos por sensor (confirmados no script de lógica embutido + inline styles)

Fonte adicional (alta confiança): bloco `data-dc-script` no fim do template define
explicitamente `color`/`bg` por sensor — isto é a especificação do próprio mock, não uma
inferência visual.

| Sensor | Cor (stroke/acento) | Hex | `bg` claro associado (usado no tema light) |
|---|---|---|---|
| Temperatura | laranja | `#f97316` | `#fff7ed` |
| Umidade | azul céu | `#0ea5e9` | `#f0f9ff` |
| Pressão | **teal** (não azul) | `#14b8a6` | `#f0fdfa` |
| Índice UV | roxo | `#a855f7` | `#faf5ff` |
| Chuva | ciano | `#06b6d4` | `#ecfeff` |
| Vento | verde-esmeralda | `#10b981` | `#ecfdf5` |

> **Correção em relação ao "ponto de partida" do spec.md / STATE.md**: o spec listava pressão como
> `#3b82f6`/`#14b8a6` (duas opções) — **confirmado: é `#14b8a6`** (teal), não azul. Chuva não
> constava na lista observada anterior — é `#06b6d4` (ciano), uma cor própria, **distinta** do azul
> de umidade. **Vento é um 6º sensor com acento próprio (`#10b981`)** que não estava no spec
> original — na dashboard ele aparece sempre no estado "sem sinal" (offline), então seu acento só
> é visível nos ícones do script de lógica e no dropdown "Sensores (6)" da página de Histórico,
> nunca colorido ativamente no dashboard mockado.

### 1.5 Cores de estado / feedback

| Token | Hex | Uso |
|---|---|---|
| `status.positive` (delta ▲) | `#16a34a` | seta de alta em card (quando o valor sobe) |
| `status.online.text` | `#4ade80` | texto/dot "Online"/"Estação online" |
| `status.negative` (delta ▼) | `#dc2626` | seta de baixa em card |
| `status.neutral` (delta —) | `#9ca3af` | delta "estável" |
| `brand.primary` | `#16a34a` | ícone do app na sidebar, item de nav ativo (bg `rgba(22,163,74,0.16)` + texto `#4ade80`), botão "Exportar", pill de período ativo, toggle "on", dia de início/fim no calendário |

**Achado importante sobre a lógica de delta**: a cor/seta do delta **não é semântica por sensor**
(ex.: chuva subindo nem sempre é "bom"), é puramente direcional — confirmado no script:
```js
deltaColor: flat ? '#9ca3af' : (up ? '#16a34a' : '#dc2626'),
deltaArrow: flat ? '—' : (up ? '▲' : '▼'),
```
Ou seja: subiu → verde/▲; desceu → vermelho/▼; igual → cinza/—, independente de qual sensor é.
Vale para o `StatCard` de T5.3: a prop deve ser algo como `trend: 'up' | 'down' | 'flat'`, não uma
regra por sensor.

**Inconsistência encontrada no próprio mock**: o item ativo da bottom-nav mobile usa
`color: rgb(59, 130, 246)` (`#3b82f6`, azul) para o ícone+label ativo ("Dashboard"), enquanto a
sidebar desktop usa verde (`#4ade80` texto sobre `rgba(22,163,74,0.16)`) para o item ativo. **Isto
é uma inconsistência do arquivo de design original** (não um erro de extração) — recomendação para
T5.2/T5.3: padronizar em verde (`brand.primary`), que é a cor dominante do produto (logo, botões
primários, toggle, pill ativo), e tratar o azul mobile como desvio a não replicar.

### 1.6 Estados do sistema — banner de erro (só visto em light mode no arquivo)

| Token | Hex | Uso |
|---|---|---|
| `danger.bg` | `#fef2f2` | fundo do banner "Estação sem conexão" |
| `danger.border` | `#fecaca` | borda do banner |
| `danger.icon`/`danger.accent` | `#dc2626` | ícone de alerta |
| `danger.title` | `#991b1b` | título do banner |
| `danger.body` | `#b91c1c` | corpo do texto do banner |

> O arquivo **não** inclui uma variante dark deste banner (nem do skeleton de carregamento, nem
> da tabela vazia, nem do card de sensor offline genérico — só existe o caso específico do card
> "Vento" com dashed border dentro do dashboard dark, que é diferente do swatch genérico). Esses
> equivalentes dark terão que ser **inferidos** em T5.2/T5.3 seguindo a paleta de superfícies dark
> já extraída (ex.: banner de erro em dark provavelmente usa `bg` translúcido de vermelho sobre
> `surface.card`, mas isso é uma decisão de design nova, não uma extração).

---

## 2. Tipografia

- **Família:** `Inter` (carregada via `@font-face` embutido em base64/woff2 no próprio HTML — 35
  blocos `@font-face`, cobrindo 5 pesos × 7 subsets de unicode-range). Fallback: `sans-serif`.
  Confirmado por render: `document.fonts.status === "loaded"` e `getComputedStyle(...).fontFamily`
  resolve para `"Inter, sans-serif"` em todos os elementos testados.
- **Pesos usados no dark dashboard/histórico:** `400` (base/body), `500`, `600`, `700`. Peso `800`
  existe no `@font-face` mas não foi observado em uso nos mockups renderizados.
- **Escala de tamanho observada** (px) e onde aparece:

| px | peso | uso |
|---|---|---|
| 9.5 | 600 | mini-labels de sensor no card de histórico mobile (`TEMP`, `UMID`, `PRESS`, `UV`) |
| 10 | 700 | badge de delta (▲/▼) no StatCard mobile |
| 10.5 | 400 | unidade ao lado do valor no StatCard mobile |
| 11 | 500 | label do sensor no StatCard mobile; eixo de gráfico desktop |
| 11.5 | 600 | cabeçalho de coluna da tabela; botão de período mobile (histórico) |
| 12 | 400–700 | textos secundários gerais (status "Online", labels de sidebar, dias do calendário) |
| 12.5 | 500–700 | label do sensor (desktop), pills de período, botão "Últimas 24h ▾", célula de tabela |
| 13 | 400–600 | item de nav da sidebar, célula secundária da tabela, título do empty-state |
| 13.5 | 500–600 | item de nav da sidebar (peso varia ativo/inativo) |
| 14 | 600–700 | título de ChartCard, brand da sidebar |
| 20 | 700 | título de página ("Dashboard"/"Histórico"); valor do StatCard **mobile** |
| 27 | 700 | valor do StatCard **desktop** |

- **Números tabulares:** valores grandes usam `font-variant-numeric: tabular-nums` +
  `letter-spacing: -0.02em` (confirmado computado: `27px` → `letter-spacing: -0.54px`). Importante
  para não ter "jitter" de largura quando o valor muda (ex.: polling ao vivo).

---

## 3. Spacing, radius e shadow

### 3.1 Spacing (padding/gap observados, px)

Escala não estritamente em grid de 4/8, mas os valores mais recorrentes são:
`2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 34, 40, 48, 56`.

Pontos de referência:
- Padding do container principal (desktop, dentro do "browser frame"): `26px 28px`.
- Padding do StatCard: desktop `16px`; mobile `11px`.
- Gap interno do StatCard: `10px` (desktop) / `6px` (mobile).
- Gap do grid de StatCards: `16px` (desktop, `grid-template-columns: repeat(3, 1fr)`); `10px`
  (mobile, `grid-template-columns: repeat(2, 1fr)`).
- Padding de célula de tabela (Histórico desktop): `32px 16px` (primeira/última coluna) / `32px
  12px` (colunas centrais) — bem generoso verticalmente.
- Padding de ChartCard: `20px` (desktop) / `12px 14px` (mobile).
- Padding de pill/botão de período: `7px 13px`–`8px 15px`.

### 3.2 Border-radius

| px / valor | uso |
|---|---|
| `3` | cantos das barras do gráfico de chuva (`rx="3"` no SVG) |
| `4` | placeholders de skeleton (linhas pequenas) |
| `7` | botões de paginação (`‹ 1 2 ›`) |
| `8` | pills/botões (período, dropdown, export), ícone de nav mobile no header do histórico, dia do calendário |
| `9` | placeholder de skeleton (ícone) |
| `10` | item de nav da sidebar; ícone chip do StatCard mobile |
| `12` | painel de status "Online" na sidebar |
| `14` | StatCard mobile; card de histórico mobile; tabela (container, desktop) |
| `16` | StatCard desktop; ChartCard; container "browser frame"; card dashed de estado vazio |
| `40` | bezel do frame de celular (mockup) — **não é token de produto**, é moldura do device mock |
| `50%` | círculos (dot de status, knob do toggle) |
| `999px` (pill) | trilho do toggle "Modo escuro"; pills de período no Histórico **mobile** (no desktop os mesmos botões usam `8px`, não pill — diferença de forma entre breakpoints) |

### 3.3 Shadow

Só uma sombra real de produto foi observada nos mockups dark:

```
box-shadow: rgba(15, 23, 42, 0.3) 0px 24px 48px;
```

Aplicada **apenas** ao container externo ("janela" do app, desktop e mobile) — simula a
tela flutuando sobre o canvas de apresentação. **Nenhum card interno (StatCard, ChartCard,
tabela) tem box-shadow no tema dark** — são "flat", diferenciados só por `background` +
`border` 1px. Isso é um traço de design relevante: não introduzir sombras em cards ao montar
os componentes React — a fidelidade pede bordas sutis, não elevação via sombra.

(No tema light, o "Date range picker" swatch usa uma sombra bem mais discreta:
`rgba(15,23,42,0.04) 0px 1px 2px` — fora de escopo do v1, citado só como referência.)

---

## 4. Verificação (computed style vs. inline)

Para confirmar que o render é fiel e que os valores acima não são só texto do template mas o que
de fato é pintado na tela, rodei `getComputedStyle` sobre 3 elementos do mockup "Desktop ·
Dashboard (dark mode)`:

| Elemento | backgroundColor | border | borderRadius | boxShadow | fontFamily |
|---|---|---|---|---|---|
| Container externo | `rgb(13,17,23)` | `1px solid rgb(38,44,53)` | `16px` | `rgba(15,23,42,0.3) 0 24px 48px 0` | `Inter, sans-serif` |
| Sidebar | `rgb(18,22,29)` | — | `0px` | `none` | `Inter, sans-serif` |
| StatCard (Temperatura) | `rgb(22,27,34)` | `1px solid rgb(38,44,53)` | `16px` | `none` | `Inter, sans-serif` |
| Valor "24.6" (span) | `rgba(0,0,0,0)` | — | — | — | `font-size:27px; font-weight:700; letter-spacing:-0.54px` |

100% consistente com os valores lidos do HTML inline. `document.fonts.status` = `"loaded"`, sem
erros no console/página (`page.on('console'|'pageerror'|'requestfailed')` não reportou nada
durante o carregamento) — o render é limpo, sem fallback de fonte ou asset quebrado.

---

## 5. Inventário de componentes

### 5.1 `StatCard` (card de sensor)

Estrutura: `[ícone em chip] ......... [delta ▲/▼/— + texto]` / `[label do sensor]` /
`[valor grande][unidade]` / `[sparkline SVG]`.

- Ícone: chip quadrado arredondado (`iconBg`), ícone SVG stroke na cor de acento do sensor
  (largura de traço 2, `stroke-linecap/linejoin: round`).
- Delta: seta (▲/▼/—) + texto, cor conforme trend (ver §1.5). Ausente/"estável" quando delta = 0.
- Label: nome do sensor (`text.tertiary`, peso 500).
- Valor: número grande (`text.primary`, peso 700, tabular-nums) + unidade pequena (`text.muted`)
  ao lado, alinhados na baseline.
- Sparkline: `<svg><polyline stroke={accent}>` sem preenchimento, altura ~20–30px, sem eixos.
- **Variante offline/sem dado** (ex.: Vento no dashboard): mesma "silhueta" de card mas com
  `border` tracejada, fundo mais escuro (`surface.sidebar`, não `surface.card`), ícone cinza
  (`text.faint`), sem valor numérico — mostra ícone + label + "Sem sinal" + "Última leitura há Xh"
  em vez de valor/sparkline. **Isto já é o "estado nulo" pedido em DS-04** — o mock já modela
  visualmente o que acontece quando `value` é `null`.
- Grid: `repeat(3, 1fr)` desktop (6 sensores → 2 linhas de 3), `repeat(2, 1fr)` mobile (2 colunas,
  cards empilham).

### 5.2 `ChartCard`

Duas variantes vistas:
- **Linha dupla** ("Temperatura & Umidade — últimas 24h"): título + legenda (dots coloridos +
  label) alinhada à direita do título; abaixo, `<svg><polyline>` (uma por série, sem preenchimento,
  sem grid/eixo Y, só labels de hora no eixo X abaixo do SVG).
- **Barras** ("Chuva acumulada — hoje"): mesmo header (só título, sem legenda pois é 1 série);
  `<svg><rect rx="3">` por barra, cor única (acento do sensor).
- Layout desktop: grid `1.3fr 1fr` (linha maior, barra menor) lado a lado. Mobile: charts
  empilhados, um por vez, sem legenda extra (mobile Histórico não replica o card de chuva).

### 5.3 `PeriodSelector`

- Desktop (Histórico): grupo de botões retangulares (`radius: 8px`), ativo = fundo verde sólido +
  texto branco; inativos = fundo `surface.card` + borda + texto `text.tertiary`. Opções: "Hoje",
  "7 dias", "30 dias", "Personalizado ▾" (dropdown).
- Mobile (Histórico): mesma paleta, porém **pill totalmente arredondada** (`radius: 999px`),
  em linha horizontal com `overflow-x: auto` (scroll horizontal em vez de quebrar linha).
- Dashboard (ambos breakpoints) usa uma variante reduzida: um único botão dropdown
  "Últimas 24h ▾" (não é um grupo de pills) — é conceitualmente o mesmo componente em modo
  "single select fechado", não um componente separado.

### 5.4 `StatusPill` / indicador de status

- Sidebar desktop: card (`surface.card`, radius 12px, padding 10px) com dot verde (`#4ade80`,
  6-7px) + texto "Online" (verde) + linha secundária "Última leitura: HH:MM" (`text.muted`).
- Header mobile: versão inline (sem card), só dot + "Estação online" + "há X min" à direita.
- Toggle "Modo escuro": trilho pill (`999px`, verde quando on) + knob branco circular com
  sombra sutil (`rgba(0,0,0,0.3) 0 1px 2px`) — é um switch on/off, não um StatusPill, mas
  reaproveita a cor `brand.primary` para "on".

### 5.5 Navegação (Sidebar / Bottom nav / Topbar)

- **Sidebar desktop** (`224px` fixa): brand (ícone + "Sítio Verde") → divisor → 2 itens de nav
  (Dashboard/Histórico, item ativo com bg `rgba(22,163,74,0.16)` + texto verde) → spacer
  (`margin-top: auto`) → toggle de tema → painel de status.
- **Bottom nav mobile**: 2 itens (Dashboard/Histórico), full-width, ícone+label empilhados,
  fundo semi-transparente (`rgba(13,17,23,0.92)`) com blur implícito (não confirmado blur real,
  só a transparência). Ativo usa azul `#3b82f6` (inconsistência já anotada em §1.5).
- **Topbar do Dashboard**: título + subtítulo à esquerda; "Atualizado há X min · data" + botão de
  período à direita (`margin-left: auto` empurra para a direita).
- **Topbar do Histórico**: título + pills de período + dropdown "Sensores (N) ▾" + botão
  "Exportar ▾" (verde, `margin-left: auto`), tudo em uma única linha com `flex-wrap: wrap`.

### 5.6 Tabela de histórico (desktop) / Cards de histórico (mobile)

- Desktop: tabela real (`grid-template-columns: 1.3fr repeat(6, 1fr)` simulando `<table>` via
  divs), cabeçalho com fundo `surface.sidebar`, cada coluna de sensor colorida com o acento do
  sensor no **header apenas** (dado em si fica em `text.tertiary` neutro); paginação simples
  (`‹ 1 2 ›`) + contador "Mostrando N de M leituras".
- Mobile: **não é a mesma tabela reduzida** — vira uma lista de cards, um por timestamp, cada
  card com o horário como título e um grid `repeat(4, 1fr)` de mini pares label/valor (só 4 dos 6
  sensores couberam no mock: TEMP/UMID/PRESS/UV — chuva e vento ficaram de fora da versão mobile).
  Isso é uma decisão de responsividade a replicar em T5.3, não um corte acidental.

### 5.7 Estados vazios / especiais

- **Card offline por sensor** (dentro do grid, ex. Vento): ver §5.1 variante offline.
- **Skeleton de carregamento**: blocos cinza-claro (`#eee f0f2`≈`#eef0f0`, visto só em light) com
  `border-radius: 4px`/`9px`, simulando ícone+label+valor+sparkline — mesma silhueta do StatCard
  real. Dark equivalent: inferir usando `surface.chip`/`surface.card` em tom "shimmer".
- **Tabela vazia**: ícone + "Nenhum dado no período" + "Ajuste o intervalo de datas ou os
  sensores selecionados" — centralizado, só visto em light.
- **Banner de estação offline**: ver §1.6 — só visto em light.
- **Date range picker**: calendário com mês/navegação, células de dia (hoje/intervalo/fora do mês
  com estilos distintos — cores calculadas dinamicamente no script, com variante `dark` já prevista
  na função `buildMonth(..., theme)` do próprio script-fonte, mesmo que não renderizada no dark
  mockup deste arquivo). Ou seja, **o autor do design já previu tema escuro para o calendário em
  código** (`theme === 'dark' ? 'rgba(22,163,74,0.18)' : '#ecfdf5'` etc.), útil para T5.3.

---

## 6. Estrutura geral das telas

- **Container**: "janela" única (border 1px + radius 16px + shadow), com **sidebar fixa à
  esquerda (224px)** + área de conteúdo flexível (desktop). Em mobile, é um frame de celular
  (390px, moldura preta, bezel 40px de radius) com header + bottom nav fixos e conteúdo scrollável
  entre eles.
- **Dashboard**: topbar → grid de StatCards (3×2 desktop, 2×3 mobile) → grid de 2 ChartCards
  (desktop) / ChartCards empilhados (mobile).
- **Histórico**: topbar com filtros → tabela paginada (desktop) / lista de cards (mobile).
- **Responsividade confirmada por inferência estrutural** (mobile vs desktop são mockups
  literalmente separados no arquivo, não um único layout com media query) — os dois breakpoints
  têm HTML/atributos diferentes o suficiente (grid 3 col → 2 col, tabela → cards, pills retangular
  → pill redonda, sidebar → bottom nav) que confirma **mobile não é só "desktop encolhido"**: há
  decisões de layout específicas por breakpoint que os componentes React devem reproduzir (não
  basta CSS responsivo ingênuo, alguns componentes trocam de estrutura, não só de tamanho).

---

## 7. Resumo rápido para T5.2 (Tailwind theme)

```
surface.page      #0d1117
surface.sidebar   #12161d
surface.card      #161b22
surface.chip      #1c2129
border.default    #262c35
border.subtle     #1e232b
border.dashed     #2a313c
text.primary      #f3f4f6
text.secondary    #d1d5db
text.tertiary     #9ca3af
text.muted        #6b7280
text.faint        #4b5563
text.disabled     #3f4854
brand.primary     #16a34a
status.online     #4ade80
status.positive   #16a34a
status.negative   #dc2626
status.neutral    #9ca3af

sensor.temperature #f97316
sensor.humidity    #0ea5e9
sensor.pressure    #14b8a6
sensor.uv          #a855f7
sensor.rain        #06b6d4
sensor.wind        #10b981

font-family: Inter, sans-serif  (pesos 400/500/600/700 em uso)
radius: 3,4,7,8,9,10,12,14,16,999px,50%
shadow.frame: 0 24px 48px rgba(15,23,42,0.3)   (só no container externo, nenhum card interno)
```
