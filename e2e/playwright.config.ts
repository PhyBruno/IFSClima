import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config da suíte E2E (F7 T7.1 — spec.md ".specs/features/f7-e2e-deploy/spec.md").
 *
 * Este pacote assume que o stack já está no ar (via `docker compose up` na
 * raiz do monorepo, ou o fallback local documentado em `e2e/README.md`) —
 * não sobe `webServer` sozinho, porque o alvo real é o `docker compose`
 * completo (api + web + db), não um servidor de dev isolado.
 *
 * - `E2E_BASE_URL` — onde o `web` (dashboard) responde. Default
 *   `http://localhost:5173` (mesmo `WEB_PORT` default do `.env.example`).
 * - `E2E_API_URL` — onde a `api` responde diretamente, para os testes
 *   ingerirem dados via `POST /api/v1/ingest` sem passar pelo proxy do Vite
 *   (mais direto/determinístico que confiar no proxy `/api` do `web`).
 *   Default `http://localhost:3000` (mesmo `API_PORT` default).
 * - `E2E_INGEST_API_KEY` — header `X-API-Key` usado pelos testes para
 *   ingerir. Default igual ao `INGEST_API_KEY` de exemplo em `.env.example`
 *   (`whs_test_ABC123`) — troque se o `.env` local usar outro valor.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

// Ambiente sandboxed: Chromium já vem pré-instalado fora do cache padrão do
// Playwright (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), então
// `playwright install` não deve rodar aqui — apontamos o executável direto.
// Em outra máquina/CI sem essa variável, `executablePath` fica `undefined` e
// o Playwright usa o Chromium baixado normalmente por `playwright install`.
const sandboxChromiumPath = "/opt/pw-browsers/chromium";
const useSandboxChromium =
  process.env.PLAYWRIGHT_BROWSERS_PATH === "/opt/pw-browsers" && existsSync(sandboxChromiumPath);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // 1 retry: além de tolerar flakiness pontual de rede/timing, garante que
  // `trace`/`screenshot: "on-first-retry"` abaixo realmente produzam
  // artefato na primeira falha (spec.md T7.1: "Artefatos (screenshot/trace)
  // em falha").
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(useSandboxChromium ? { launchOptions: { executablePath: sandboxChromiumPath } } : {}),
      },
    },
  ],
});
