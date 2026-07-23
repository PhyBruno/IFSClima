import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Testes de integração de F2 sobem Postgres via Testcontainers
    // (pull + boot de imagem); precisam de mais tempo que o default (5s/10s).
    testTimeout: 30000,
    hookTimeout: 90000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      // server.ts, db/migrate.ts e db/seed.ts têm um bloco `main()`/CLI
      // (bootstrap, guardado por `isMain`) que não roda sob `vitest` — a
      // lógica de negócio real (runMigrations/seedMainStation) é testada
      // diretamente em test/db/*.test.ts. Mesmo padrão de server.ts (F1).
      exclude: ["src/server.ts", "src/db/migrate.ts", "src/db/seed.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
