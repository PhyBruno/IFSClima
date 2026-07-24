# Extração do Design — `Estacao Meteorologica (standalone).html`

> T5.1 + T5.1b (F5 · Design System). Fonte: `Estacao Meteorologica (standalone).html` (raiz do repo).
> Cobre os **dois temas** (escuro e claro) com o mesmo rigor de extração — ver nota logo abaixo
> sobre a mudança de escopo que trouxe o tema claro para o v1 (DS-07).
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

> **Atualização (T5.1b):** a primeira passada deste documento (T5.1) tratava o tema claro como
> fora de escopo — a spec original listava "Tema claro; claro é v2" e o light só havia sido
> inspecionado "de relance" (cores de fundo por sensor, banner de erro, skeleton). Em
> 2026-07-23 o usuário pediu para incluir os dois temas já no v1 (toggle claro/escuro, escuro
> como default — ver DS-07 em `.specs/features/f5-design-system/spec.md` e a decisão D16 em
> `.specs/project/STATE.md`). T5.1b refez a varredura do tema claro com o **mesmo rigor** usado
> para o dark (render real + `getComputedStyle`, não inferência) — ver seção 8. As seções 1-7
> abaixo permanecem como a extração original do tema escuro (não foram re-verificadas nesta
> passada, mas nenhuma inconsistência com o novo render foi encontrada nos pontos cruzados).

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

(No tema light a história é mais nuançada — ver §8.8 para o levantamento completo por
componente: cards normais e o date range picker **têm** uma sombra discreta
`rgba(15,23,42,0.04) 0px 1px 2px`, mas ChartCard/tabela/sidebar/empty-states permanecem flat
mesmo no light.)

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

---

## 8. Tokens — Tema Claro

Extraído em T5.1b com o **mesmo método** da seção 1-7 (render Playwright + `getComputedStyle`),
não por inferência. Achado estrutural importante que só apareceu ao investigar o light: os **8
mockups (4 telas × 2 temas) e a galeria "Estados do sistema" vivem todos dentro do mesmo
container renderizado** — light e dark não são árvores DOM isoladas, são irmãos no mesmo `flex`
com `flex-wrap`. Isso permitiu comparar lado a lado, no mesmo `page.evaluate`, os valores
inline de um elemento e do seu equivalente no outro tema, sem risco de pegar o mockup errado.

### 8.1 Superfícies (light)

| Token proposto | Hex | rgb() observado | Onde aparece |
|---|---|---|---|
| `surface.page` | `#f7f8f9` | `rgb(247,248,249)` | fundo do container "janela" (dashboard e histórico, desktop e mobile) — equivalente light de `surface.page` dark |
| `surface.sidebar` / `surface.panel` | `#ffffff` | `rgb(255,255,255)` | sidebar desktop (background) |
| `surface.card` | `#ffffff` | `rgb(255,255,255)` | StatCard, ChartCard, tabela, card de histórico mobile, botão de dropdown, date range picker |
| `surface.chip` / `surface.iconBg` | **não existe um chip neutro no light** — o fundo do ícone do StatCard usa diretamente o `bg` claro por sensor (§1.4), ex. `#fff7ed` para temperatura, `#f0f9ff` para umidade etc. | — | fundo do círculo/quadrado de ícone dentro do StatCard |
| `surface.statusPanel` | `#f7f8f9` | `rgb(247,248,249)` | painel "Online" na sidebar (mesmo tom do `surface.page`, mas com borda própria — ver §8.2) |
| `surface.tableHeader` | `#fafbfb` | `rgb(250,251,251)` | fundo do cabeçalho da tabela (Histórico desktop); mesmo tom usado nos inputs de data do date range picker |

> **Achado notável:** ao contrário do dark (onde `surface.page` < `surface.sidebar` <
> `surface.card` < `surface.chip`, cada um um degrau mais claro que o anterior), no light
> `surface.sidebar` e `surface.card` são **o mesmo branco puro** (`#ffffff`) — o que os diferencia
> do `surface.page` (`#f7f8f9`, ligeiramente acinzentado) é só a borda 1px, não um degrau de
> fundo. E não há um "chip neutro" equivalente ao `#1c2129` do dark: cada chip de ícone no light
> já nasce colorido com o tom pastel do próprio sensor — não é um token único, é o array de
> `bg` por sensor da §1.4 (confirmado idêntico entre uso no StatCard e na definição em
> `data-dc-script`, reaproveitado aqui em vez de duplicado).

### 8.2 Bordas (light)

| Token proposto | Hex | rgb() | Uso |
|---|---|---|---|
| `border.default` | `#e6e8eb` | `rgb(230,232,235)` | borda de StatCard, ChartCard, tabela (container), sidebar (border-right), botões/pills inativos, dropdown, date range picker, trilho do toggle "off" (mesma cor, ver §8.7) |
| `border.frame` | `#e2e4e7` | `rgb(226,228,231)` | borda do container "janela" desktop — tom próprio, ligeiramente mais escuro que `border.default`, só nesse contexto (não observado em dark: lá o frame usa a mesma `border.default`) |
| `border.subtle` | `#f0f1f2` | `rgb(240,241,242)` | divisor abaixo do brand na sidebar; divisor entre linhas da tabela (Histórico desktop); divisor acima do rodapé do date range picker |
| `border.dashed` | `#d8dade` | `rgb(216,218,222)` | borda tracejada do card "sem dado" (sensor offline) **dentro do grid do dashboard**, mobile e desktop |

> **Inconsistência encontrada (nova, específica do light):** o swatch genérico "Sensor sem
> dados / offline" da galeria "Estados do sistema" usa `border: 1px dashed rgb(230,232,235)`
> (`#e6e8eb`, igual a `border.default`) — **diferente** do card de vento real dentro do
> dashboard mockado, que usa `#d8dade` (mais escuro, mais contraste contra o fundo branco). É o
> mesmo tipo de discrepância "swatch genérico vs. instância real no mockup" já visto no dark
> para outros estados; recomendação para T5.2b/T5.3: usar `#d8dade` (o valor visto **em
> contexto real de produto**, não no swatch avulso da galeria) como `border.dashed` oficial.
>
> Padrão inverso ao dark: no dark, `border.dashed` (`#2a313c`) é **mais claro** que
> `border.default` (`#262c35`) para ganhar contraste contra fundo escuro; no light,
> `border.dashed` (`#d8dade`) é **mais escuro** que `border.default` (`#e6e8eb`) pelo mesmo
> motivo — contraste na direção oposta, comportamento coerente entre os dois temas.

### 8.3 Texto (light)

| Token proposto | Hex | rgb() | Uso |
|---|---|---|---|
| `text.primary` | `#111827` | `rgb(17,24,39)` | valores grandes, títulos de página/cards, brand, texto de data/hora na tabela |
| `text.secondary` | `#374151` | `rgb(55,65,81)` | texto do botão "Últimas 24h ▾"/"Personalizado", células de dado da tabela (não a coluna de data/hora), título do empty-state da tabela, botão "Cancelar" do date range picker, paginação (página não-ativa) |
| `text.tertiary` | `#6b7280` | `rgb(107,114,128)` | labels de sensor no StatCard, item de nav inativo (texto), "Última leitura: HH:MM" no painel de status — **mesmo hex do `text.muted` do dark**, mas usado num papel de hierarquia mais alta aqui |
| `text.muted` | `#9ca3af` | `rgb(156,163,175)` | unidade ao lado do valor, "Atualizado há...", dias da semana do calendário, item de nav inativo (ícone), texto "Vento"/"Sem sinal" no card offline, seta "‹" desabilitada da paginação — **mesmo hex do `text.tertiary` do dark** |
| `text.faint` | `#c1c5cb` | `rgb(193,197,203)` | labels de eixo dos mini-gráficos (`07:00`/`14:00`), "Última leitura há 3h" no card offline do dashboard, ícone do card offline do dashboard, seta "→" do date range picker |
| `text.disabled` | *(não há um 6º tom claramente distinto; ver nota abaixo)* | — | — |

> **Achado notável:** os tokens de texto do light **não são o negativo 1:1** dos do dark — os
> hexes de `text.tertiary`/`text.muted` do light (`#6b7280`/`#9ca3af`) são **os mesmos hexes**
> usados no dark (lá como `text.muted`/`text.tertiary`, papéis trocados), só que num tema claro
> o cinza-médio funciona tanto para "secundário" quanto pertence à mesma família visual; não é
> coincidência de extração, é reaproveitamento real do design (confirmado em múltiplos
> elementos, ex. label do sensor sempre `rgb(107,114,128)` nos dois breakpoints).
>
> **Inconsistência de tom "faint" encontrada:** o ícone do card offline dentro do dashboard usa
> stroke `#c1c5cb`, mas o ícone do swatch genérico "Sensor sem dados/offline" da galeria usa
> stroke `#d1d5db` (`rgb(209,213,219)`) — dois tons de cinza muito próximos porém **diferentes**
> para o mesmo conceito visual. Mesma classe de inconsistência "swatch vs. instância real"
> do §8.2; recomendação: preferir `#c1c5cb` (visto na instância real do dashboard) e tratar
> `#d1d5db` como variação a não replicar.
>
> Não foi encontrado um 6º tom de texto claramente correspondente ao `text.disabled` do dark
> (`#3f4854`) — o texto mais apagado observado no light é o próprio `text.faint` (`#c1c5cb`).
> Se for necessário um tom ainda mais discreto que `text.faint` em T5.2b, ele terá que ser
> **inferido** (não há instância renderizada no arquivo que exija um 6º nível no light).

### 8.4 Acentos por sensor (light)

Confirmado por render que os acentos (`stroke`/cor do ícone) **são idênticos entre light e
dark** — mesmos hexes da tabela em §1.4 (`#f97316`, `#0ea5e9`, `#14b8a6`, `#a855f7`, `#06b6d4`,
`#10b981`), tanto no ícone do StatCard quanto no cabeçalho colorido da tabela de Histórico
(desktop) e nas legendas do ChartCard. Nenhum hex de acento muda entre temas.

A coluna "`bg` claro associado" que já existia na tabela de §1.4 foi **confirmada por render**
(não só inferida do script) — o fundo do chip de ícone do StatCard no light usa exatamente esses
hexes:

| Sensor | `bg` claro (chip do StatCard) | Confirmado por render? |
|---|---|---|
| Temperatura | `#fff7ed` | ✓ (`rgb(255,247,237)`) |
| Umidade | `#f0f9ff` | ✓ (`rgb(240,249,255)`) |
| Pressão | `#f0fdfa` | ✓ (`rgb(240,253,250)`) |
| Índice UV | `#faf5ff` | ✓ (`rgb(250,245,255)`) |
| Chuva | `#ecfeff` | ✓ (`rgb(236,254,255)`) |
| Vento | `#ecfdf5` | ✓ (`rgb(236,253,245)`, visto no `bg` do `data-dc-script` — no mockup em si o sensor está sempre offline, então o chip de ícone específico do vento nunca é pintado com essa cor num StatCard real, só citado no script-fonte) |

Nenhuma duplicação necessária de §1.4 — a tabela lá já está correta; isto só confirma por render.

### 8.5 Cores de estado / feedback (light)

| Token | Hex | rgb() | Uso |
|---|---|---|---|
| `status.positive` (delta ▲) | `#16a34a` | `rgb(22,163,74)` | seta de alta em card — **mesmo hex do dark**, confirmado (lógica de delta não é por tema, é a mesma do script embutido) |
| `status.negative` (delta ▼) | `#dc2626` | `rgb(220,38,38)` | seta de baixa — mesmo hex do dark |
| `status.neutral` (delta —) | `#9ca3af` | `rgb(156,163,175)` | delta "estável" — mesmo hex do dark |
| `status.online.dot` | `#22c55e` | `rgb(34,197,94)` | dot de status "Online"/"Estação online" — **tom diferente** do texto (ver linha abaixo); no light o dot ganha um halo sutil `box-shadow: rgba(34,197,94,0.18) 0 0 0 3px` no header mobile (não existe no dark) |
| `status.online.text` | `#16a34a` | `rgb(22,163,74)` | texto "Online"/"Estação online" — **diferente do dark**, que usa `#4ade80` (verde mais claro, pensado para contraste em fundo escuro); no light o texto usa o verde mais saturado/escuro `#16a34a` para contraste em fundo branco |
| `brand.primary` | `#16a34a` | `rgb(22,163,74)` | ícone do app na sidebar, pill de período ativo, botão "Exportar"/"Aplicar", dia de início/fim do calendário, trilho do toggle "on" — mesmo hex do dark |
| `nav.active.bg` (light) | `#ecfdf5` | `rgb(236,253,245)` | fundo do item de nav ativo na sidebar desktop — **wash sólido**, não um `rgba()` translúcido como o dark (`rgba(22,163,74,0.16)`); coincide com o `bg` do sensor Vento e com o `bg` do dia "em intervalo" do calendário (mesmo hex reaproveitado em 3 contextos diferentes) |
| `nav.active.text` | `#16a34a` | `rgb(22,163,74)` | texto/ícone do item de nav ativo na sidebar |

**Achado importante — a inconsistência da bottom-nav mobile (§1.5) é exclusiva do dark:** no
mockup **light**, o item ativo da bottom-nav mobile ("Dashboard"/"Histórico" conforme a tela)
usa `color: rgb(22,163,74)` — **verde**, igual à sidebar desktop. Só no mockup **dark** o item
ativo muda para azul `#3b82f6`. Ou seja, a inconsistência relatada em T5.1 não é "mobile usa
azul, desktop usa verde" — é **"dark mobile usa azul, todo o resto (incluindo light mobile) usa
verde"**. Isso reforça ainda mais a recomendação já registrada em §1.5: padronizar em verde
(`brand.primary`) e tratar o azul como um desvio pontual do mockup dark, não um padrão
intencional de breakpoint.

### 8.6 Estados do sistema — re-confirmados por render (galeria "Estados do sistema", light-only)

Todos os 5 swatches já citados em §1.6/§5.7 foram re-renderizados e lidos via
`getComputedStyle` nesta passada — os hexes abaixo **confirmam exatamente** os valores que já
estavam no documento (nenhuma correção necessária), agora com a mesma rigor de T5.1:

| Estado | Token | Hex | Confirmado |
|---|---|---|---|
| Banner de erro | `danger.bg` | `#fef2f2` | ✓ `rgb(254,242,242)` |
| Banner de erro | `danger.border` | `#fecaca` | ✓ `rgb(254,202,202)` |
| Banner de erro | `danger.icon`/`danger.accent` | `#dc2626` | ✓ |
| Banner de erro | `danger.title` | `#991b1b` | ✓ `rgb(153,27,27)` |
| Banner de erro | `danger.body` | `#b91c1c` | ✓ `rgb(185,28,28)` |
| Skeleton | `skeleton.block` | `#eef0f2` | ✓ `rgb(238,240,242)` (blocos de ícone/label/valor) |
| Skeleton | `skeleton.blockAlt` | `#f2f3f4` | ✓ `rgb(242,243,244)` (bloco maior, "sparkline") — tom quase idêntico ao anterior, provavelmente não intencional, mas confirmado como valor real usado |
| Tabela vazia | ícone | `#d1d5db` | ✓ `rgb(209,213,219)` |
| Tabela vazia | título ("Nenhum dado no período") | `#374151` | ✓ `rgb(55,65,81)` — mesmo tom de `text.secondary` |
| Tabela vazia | subtítulo | `#9ca3af` | ✓ — mesmo tom de `text.muted` |
| Sensor offline (swatch genérico) | fundo | `#ffffff` | ✓ |
| Sensor offline (swatch genérico) | borda tracejada | `#e6e8eb` | ✓ — ver inconsistência já anotada em §8.2 |
| Date range picker | fundo do card | `#ffffff` | ✓, com sombra `rgba(15,23,42,0.04) 0 1px 2px` (ver §8.8) |
| Date range picker | dia "hoje"/borda do intervalo | `#16a34a` fundo, texto branco | ✓ |
| Date range picker | dia "dentro do intervalo" | `#ecfdf5` fundo, texto `#111827` | ✓ |
| Date range picker | inputs de data | fundo `#fafbfb`, borda `#e6e8eb`, texto `#111827` | ✓ |

Confirmado também no arquivo: **nenhum destes 5 estados tem uma variante dark renderizada**
(só existe uma ocorrência da seção "Estados do sistema" na página inteira, sempre no tema
claro) — os equivalentes dark continuam a ser **inferência** para T5.2b/T5.3, exatamente como
já registrado em §1.6 para o dark original.

Como confirmação extra: o script-fonte (`data-dc-script`) já prevê o tema escuro para o
calendário do date range picker via `buildMonth(..., theme)`:
```js
bg = theme === 'dark' ? 'rgba(22,163,74,0.18)' : '#ecfdf5';
color = theme === 'dark' ? '#f3f4f6' : '#111827';
// fora do intervalo: color = isToday ? '#16a34a' : (theme === 'dark' ? '#d1d5db' : '#111827');
```
Ou seja, o calendário dark (`calendarDark` no script) existe **na lógica**, mas nunca é
efetivamente desenhado em nenhum swatch do arquivo — é inferência garantida pelo próprio autor
do mock, não uma suposição nossa.

### 8.7 Toggle "Modo escuro" — os dois estados confirmados por render

Como o mockup light representa o app com o modo escuro **desligado** e o mockup dark representa
o modo escuro **ligado**, os dois estados do switch existem lado a lado no mesmo arquivo — não
foi preciso inferir nada aqui:

| Estado | Trilho (track) | Knob | Posição do knob | Sombra do knob |
|---|---|---|---|---|
| **Off** (visto no light) | `#e6e8eb` (`rgb(230,232,235)`, igual a `border.default` light) | `#ffffff` | `left: 2px` | `rgba(0,0,0,0.15) 0px 1px 2px` |
| **On** (visto no dark) | `#16a34a` (`brand.primary`) | `#ffffff` | `right: 2px` | `rgba(0,0,0,0.3) 0px 1px 2px` |

Dimensões (iguais nos dois estados): trilho `34×19px`, `border-radius: 999px`; knob
`15×15px`, `border-radius: 50%`. A transição entre estados não foi observada (é um mockup
estático, sem estado `:hover`/animação capturável), mas a troca de `left`/`right` sugere que a
implementação real deve animar via `transform`/`inset` no CSS.

### 8.8 Shadow (light) — levantamento completo por componente

Ao contrário do que a passada T5.1 sugeriu ("só o date range picker tem sombra no light"), a
varredura completa mostra que **vários componentes têm uma sombra sutil no light**, mas não
todos — o padrão real, confirmado por render em `surface.card` mobile/desktop e na galeria:

| Componente | box-shadow | Tem sombra? |
|---|---|---|
| Container externo ("janela", desktop) | `rgba(15,23,42,0.14) 0px 24px 48px` | sim |
| Container externo ("janela", mobile) | `rgba(15,23,42,0.18) 0px 24px 48px` | sim — **alpha diferente do desktop** (0.18 vs 0.14); no dark os dois breakpoints usam o mesmo 0.3 — o light tem essa variação extra entre breakpoints que o dark não tem |
| StatCard (normal, com dado) | `rgba(15,23,42,0.04) 0px 1px 2px` | **sim** — mobile e desktop |
| StatCard (offline/dashed, "Vento") | nenhuma | não |
| ChartCard | nenhuma | não |
| Tabela (container) | nenhuma | não |
| Sidebar / painel de status | nenhuma | não |
| Date range picker (card) | `rgba(15,23,42,0.04) 0px 1px 2px` | sim — mesmo valor do StatCard |
| Skeleton / tabela vazia / banner de erro / sensor offline (swatches da galeria) | nenhuma | não |
| Knob do toggle | `rgba(0,0,0,0.15)` off / `rgba(0,0,0,0.3)` on, `0px 1px 2px` | sim (ambos os estados) |
| Dot "Online" (header mobile) | `rgba(34,197,94,0.18) 0px 0px 0px 3px` (halo) | sim — **só no light**, não existe no dark |

Conclusão para T5.2b: cards "flat" **não é universal no light** como é no dark — StatCard e o
date range picker usam uma elevação muito discreta (`0.04` alpha, `1px 2px`, quase
imperceptível) que não existe em nenhum card no dark. Recomenda-se reproduzir essa sombra só
nesses dois componentes no tema light e manter tudo mais flat, para não sobre-elevar a UI.

### 8.9 Resumo rápido para T5.2b (Tailwind theme — tema claro)

```
surface.page           #f7f8f9
surface.sidebar        #ffffff
surface.card           #ffffff
surface.statusPanel    #f7f8f9
surface.tableHeader    #fafbfb
surface.chip           (sem token único — usar bg por sensor, ver sensor.*.bgLight)

border.default         #e6e8eb
border.frame           #e2e4e7   (só no container externo desktop)
border.subtle          #f0f1f2
border.dashed          #d8dade

text.primary           #111827
text.secondary         #374151
text.tertiary          #6b7280
text.muted             #9ca3af
text.faint             #c1c5cb
text.disabled          (não observado — inferir se necessário)

brand.primary          #16a34a          (igual ao dark)
status.positive        #16a34a          (igual ao dark)
status.negative        #dc2626          (igual ao dark)
status.neutral         #9ca3af          (igual ao dark)
status.online.dot      #22c55e
status.online.text     #16a34a          (dark usa #4ade80 — tom diferente)
nav.active.bg           #ecfdf5         (dark usa rgba(22,163,74,0.16) — wash sólido em vez de translúcido)
nav.active.text         #16a34a

sensor.temperature      #f97316   (igual ao dark)   bgLight #fff7ed
sensor.humidity         #0ea5e9   (igual ao dark)   bgLight #f0f9ff
sensor.pressure         #14b8a6   (igual ao dark)   bgLight #f0fdfa
sensor.uv               #a855f7   (igual ao dark)   bgLight #faf5ff
sensor.rain             #06b6d4   (igual ao dark)   bgLight #ecfeff
sensor.wind             #10b981   (igual ao dark)   bgLight #ecfdf5

danger.bg               #fef2f2
danger.border           #fecaca
danger.icon             #dc2626
danger.title            #991b1b
danger.body             #b91c1c

toggle.track.off        #e6e8eb
toggle.track.on         #16a34a   (mesmo em dark)
toggle.knob             #ffffff   (mesmo em dark)
toggle.knob.shadow.off  rgba(0,0,0,0.15) 0 1px 2px
toggle.knob.shadow.on   rgba(0,0,0,0.3) 0 1px 2px

shadow.frame.desktop    rgba(15,23,42,0.14) 0 24px 48px
shadow.frame.mobile     rgba(15,23,42,0.18) 0 24px 48px   (dark usa 0.3 em ambos os breakpoints)
shadow.card             rgba(15,23,42,0.04) 0 1px 2px      (StatCard normal + date range picker; nenhum outro card)
shadow.online.dot       rgba(34,197,94,0.18) 0 0 0 3px     (só light, halo do dot "Online" no header mobile)

font-family, spacing, radius: idênticos ao dark (mesmo template, só cor muda) — ver §2 e §3.
```

**Inconsistências do próprio arquivo de design encontradas nesta passada (não são erros de
extração):**

1. Bottom-nav mobile ativa: verde no light, azul (`#3b82f6`) só no dark — ver §8.5 (refina o
   achado já registrado em §1.5, que sugeria ser uma diferença de breakpoint quando na verdade é
   uma diferença de tema).
2. `border.dashed` do card offline "em contexto" (`#d8dade`) diverge do swatch genérico da
   galeria (`#e6e8eb`) — ver §8.2.
3. Ícone do card offline "em contexto" (`#c1c5cb`) diverge do ícone do swatch genérico da
   galeria (`#d1d5db`) — ver §8.3.
4. Sombra do frame externo tem alpha diferente entre mobile (0.18) e desktop (0.14) no light,
   algo que não acontece no dark (0.3 fixo nos dois breakpoints) — ver §8.8.

Recomendação geral para T5.2b/T5.3: nos itens 2 e 3, preferir sempre o valor visto **na
instância real dentro de um mockup de tela** (dashboard/histórico) em vez do valor do swatch
avulso da galeria "Estados do sistema", que parece ter sido montado um pouco separado/depois e
diverge em detalhes finos de cor.
