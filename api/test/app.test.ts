import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("buildApp", () => {
  it("cria uma instância Fastify sem subir porta e sem lançar erro", async () => {
    const app = buildApp();

    expect(app).toBeDefined();
    expect(typeof app.inject).toBe("function");

    await app.ready();
    await app.close();
  });
});
