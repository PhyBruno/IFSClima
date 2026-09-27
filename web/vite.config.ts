/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Alias `@/` -> src/ (exigido pelo shadcn/ui; espelha `paths` dos tsconfig).
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
    // F6 T6.5 (bug revelado ao testar a stack Docker de verdade): o
    // api-client (T6.1) chama `/api/v1/...` relativo (same-origin) — sem
    // isso, o browser tentaria `/api/...` no próprio :5173, que não existe.
    // `API_PROXY_TARGET` (docker-compose.yml, serviço `web`) aponta pro
    // hostname do serviço `api` dentro da rede Docker; fora do Docker (dev
    // local rodando api solto) o default `localhost:3000` cobre o caso comum.
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      // `components/ui` e `hooks/use-mobile` são código vendorizado do shadcn/ui
      // (gerado pela CLI, não escrito aqui) — fora da meta de cobertura.
      exclude: [
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/components/ui/**",
        "src/hooks/use-mobile.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
