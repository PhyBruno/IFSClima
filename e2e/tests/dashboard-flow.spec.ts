import { test, expect, request, type APIRequestContext } from "@playwright/test";

/**
 * E2E do fluxo crítico (F7 T7.1 — `.specs/features/f7-e2e-deploy/spec.md`,
 * QA-01/QA-02/QA-03): sobe o compose (ou o fallback local, ver
 * `e2e/README.md`), ingere um lote conhecido via `POST /api/v1/ingest`,
 * confirma que o dashboard mostra aqueles valores, troca o período e
 * confirma que os gráficos refletem os mesmos dados, e reenvia o MESMO lote
 * para provar idempotência (nem a API duplica, nem a UI muda).
 *
 * **Por que um teste só, com `test.step`s sequenciais** (não vários `test()`
 * independentes): os passos são inerentemente dependentes — os cards só têm
 * o que checar DEPOIS da ingestão, a troca de período só faz sentido com
 * dado já carregado, e o reenvio de idempotência precisa do MESMO lote (com
 * os MESMOS timestamps) do primeiro passo. Dividir em `test()`s separados
 * exigiria compartilhar esse estado por fora (arquivo/env) sem ganhar nada
 * em isolamento real (mesma API, mesmo banco). `test.step` mantém a
 * granularidade nos relatórios (HTML report do Playwright) sem esse custo.
 *
 * **`station_id="main"`, não um ID de teste dedicado**: v1 é single-station
 * (ver `api/src/app.ts`, `DEFAULT_STATION_ID = "main"`) — os endpoints que o
 * dashboard consome (`/readings/latest`, `/readings/series`) são fixos nessa
 * estação, então o lote do teste PRECISA usar `main` para aparecer na UI.
 *
 * **Timestamp ancorado em `Date.now()` no início do teste, não fixo no
 * código**: os cards mostram a leitura MAIS RECENTE da estação (`useLatest`)
 * — rodar a suíte contra um compose/banco persistente (não recriado a cada
 * run) exige que o lote deste run seja mais novo que qualquer leitura de
 * runs anteriores. Um timestamp fixo hardcoded quebraria na segunda
 * execução (o lote da vez anterior já seria "mais recente" na primeira
 * execução, mas viraria uma DUPLICATA idêntica na segunda, o que não é o
 * comportamento que este teste quer exercitar sozinho). `-5s` de folga
 * evita "timestamp is in the future" por qualquer diferença de relógio
 * entre a máquina do teste e o container da API.
 */

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3000";
const INGEST_API_KEY = process.env.E2E_INGEST_API_KEY ?? "whs_test_ABC123";
const STATION_ID = "main";

interface ReadingInput {
  timestamp: string;
  temperature_c: number;
  humidity_pct: number;
  pressure_hpa: number;
  rain_mm: number;
  uv_index: number;
}

/** Valores da leitura MAIS RECENTE do lote — os que os cards do dashboard devem mostrar. */
const LATEST_VALUES = {
  temperature_c: 24.5,
  humidity_pct: 60.25,
  pressure_hpa: 1013.5,
  rain_mm: 2.5,
  uv_index: 5.5,
} as const;

/**
 * Monta um lote de 5 leituras, 5 min de intervalo, terminando em
 * `latestTimestamp` (a mais recente) com `LATEST_VALUES` — todos os valores
 * são múltiplos de 0.25, exatamente representáveis em `real`/float4
 * (coluna do Postgres, `api/src/db/schema.ts`), evitando qualquer
 * arredondamento de ponto flutuante que tornaria a asserção textual do card
 * (`{value}` cru, sem `toFixed`, ver `web/src/components/StatCard.tsx`)
 * frágil.
 */
function buildBatch(latestTimestamp: Date): ReadingInput[] {
  const STEP_MS = 5 * 60 * 1000;
  const values = [
    { temperature_c: 22.5, humidity_pct: 58.0, pressure_hpa: 1012.0, rain_mm: 0.0, uv_index: 3.0 },
    { temperature_c: 23.0, humidity_pct: 59.0, pressure_hpa: 1012.5, rain_mm: 0.5, uv_index: 4.0 },
    { temperature_c: 23.5, humidity_pct: 59.5, pressure_hpa: 1013.0, rain_mm: 1.0, uv_index: 4.5 },
    { temperature_c: 24.0, humidity_pct: 60.0, pressure_hpa: 1013.25, rain_mm: 1.5, uv_index: 5.0 },
    LATEST_VALUES,
  ];

  return values.map((reading, index) => {
    const offsetFromEnd = (values.length - 1 - index) * STEP_MS;
    return {
      timestamp: new Date(latestTimestamp.getTime() - offsetFromEnd).toISOString(),
      ...reading,
    };
  });
}

async function ingest(apiContext: APIRequestContext, readings: ReadingInput[]) {
  const response = await apiContext.post("/api/v1/ingest", {
    headers: { "X-API-Key": INGEST_API_KEY },
    data: { station_id: STATION_ID, readings },
  });
  return { status: response.status(), body: (await response.json()) as { accepted: number; duplicates: number; rejected: unknown[] } };
}

/** Localiza o `StatCard` (F5/F6) do sensor pelo texto do `label` (ex. "Temperatura"). Há 5 `[data-testid="statcard"]` na página — filtrar por label é o único jeito estável de mirar UM sensor específico. */
function statCard(page: import("@playwright/test").Page, label: string) {
  return page.locator('[data-testid="statcard"]').filter({ hasText: label });
}

test.describe("Fluxo crítico: ingestão → dashboard (F7 T7.1, QA-01/QA-02/QA-03)", () => {
  test("ingerir lote, ver nos cards, refletir nos gráficos por período, e confirmar idempotência", async ({ page }) => {
    const apiContext = await request.newContext({ baseURL: API_URL });
    const latestTimestamp = new Date(Date.now() - 5_000);
    const readings = buildBatch(latestTimestamp);

    try {
      await test.step("QA-01: ingerir lote conhecido via POST /api/v1/ingest", async () => {
        const { status, body } = await ingest(apiContext, readings);

        expect(status).toBe(202);
        expect(body.rejected).toEqual([]);
        expect(body.accepted).toBe(readings.length);
        expect(body.duplicates).toBe(0);
      });

      await test.step("QA-01: dashboard mostra os valores da leitura mais recente", async () => {
        await page.goto("/");

        await expect(statCard(page, "Temperatura")).toContainText(`${LATEST_VALUES.temperature_c}`);
        await expect(statCard(page, "Temperatura")).toContainText("°C");

        await expect(statCard(page, "Umidade")).toContainText(`${LATEST_VALUES.humidity_pct}`);
        await expect(statCard(page, "Umidade")).toContainText("%");

        await expect(statCard(page, "Pressão")).toContainText(`${LATEST_VALUES.pressure_hpa}`);
        await expect(statCard(page, "Pressão")).toContainText("hPa");

        await expect(statCard(page, "Chuva")).toContainText(`${LATEST_VALUES.rain_mm}`);
        await expect(statCard(page, "Chuva")).toContainText("mm");

        await expect(statCard(page, "Índice UV")).toContainText(`${LATEST_VALUES.uv_index}`);
      });

      await test.step("QA-02: trocar o período reflete os dados ingeridos nos gráficos", async () => {
        const temperatureChart = page.locator('[data-testid="chartcard"]').filter({ hasText: "Temperatura" }).first();

        // Estado inicial (24h, default): o gráfico de Temperatura tem dado
        // real (svg desenhado), não o EmptyState ("Nenhum dado no período")
        // — prova de que a série de 24h já reflete o lote recém-ingerido.
        await expect(temperatureChart.getByTestId("chart-svg")).toBeVisible();
        await expect(temperatureChart.getByText("Nenhum dado no período")).toHaveCount(0);
        const labelsBefore = await temperatureChart.locator("span").allTextContents();

        const sevenDaysButton = page.getByRole("button", { name: "7 dias" });
        await sevenDaysButton.click();

        // `ChartsSection` guarda o período em `?range=` (não um state solto,
        // ver docstring do componente) — a URL mudar é o sinal mais direto
        // de que o clique realmente trocou o período pedido.
        await expect(page).toHaveURL(/range=7d/);
        await expect(sevenDaysButton).toHaveAttribute("aria-pressed", "true");

        // Depois de trocar o período, o mesmo card de Temperatura continua
        // com dado real (não regride para o EmptyState) — o bucket de 7d é
        // horário (ver `ChartsSection.tsx`/`readings-service.ts`) e o lote
        // ingerido cai nas últimas horas, então aparece nos dois períodos.
        await expect(temperatureChart.getByTestId("chart-svg")).toBeVisible();
        await expect(temperatureChart.getByText("Nenhum dado no período")).toHaveCount(0);

        // Rótulos do eixo X mudam de formato (HH:MM em 24h → um por dia,
        // DD/MM, em 7d — ver `buildXLabels`/`uniqueDayLabels` em
        // `ChartsSection.tsx`) — evidência observável de que o gráfico de
        // fato RE-RENDERIZOU com uma agregação diferente, não só manteve a
        // tela anterior.
        const labelsAfter = await temperatureChart.locator("span").allTextContents();
        expect(labelsAfter.join(",")).not.toBe(labelsBefore.join(","));
      });

      await test.step("QA-03: reenviar o MESMO lote confirma idempotência (accepted=0, duplicates=N)", async () => {
        const { status, body } = await ingest(apiContext, readings);

        expect(status).toBe(202);
        expect(body.rejected).toEqual([]);
        expect(body.accepted).toBe(0);
        expect(body.duplicates).toBe(readings.length);
      });

      await test.step("QA-03: nada duplicou/mudou visivelmente — card continua com o mesmo valor após reload", async () => {
        await page.reload();

        await expect(statCard(page, "Temperatura")).toContainText(`${LATEST_VALUES.temperature_c}`);
      });
    } finally {
      await apiContext.dispose();
    }
  });
});
