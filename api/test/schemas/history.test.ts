import { describe, expect, it } from "vitest";
import { exportQuerySchema, historyQuerySchema } from "../../src/schemas/history.js";

describe("historyQuerySchema (T8.1 — HIST-10)", () => {
  it("aceita from/to/page/page_size/order válidos", () => {
    const parsed = historyQuerySchema.safeParse({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-02T00:00:00.000Z",
      page: "2",
      page_size: "100",
      order: "asc",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-02T00:00:00.000Z",
        page: 2,
        page_size: 100,
        order: "asc",
      });
    }
  });

  it("aceita query vazia e aplica defaults (page=1, page_size=50, order=desc, from/to ausentes)", () => {
    const parsed = historyQuerySchema.safeParse({});

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.from).toBeUndefined();
      expect(parsed.data.to).toBeUndefined();
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.page_size).toBe(50);
      expect(parsed.data.order).toBe("desc");
    }
  });

  it("page_size acima de 500 → erro", () => {
    const parsed = historyQuerySchema.safeParse({ page_size: "501" });

    expect(parsed.success).toBe(false);
  });

  it("page_size no teto de 500 é aceito", () => {
    const parsed = historyQuerySchema.safeParse({ page_size: "500" });

    expect(parsed.success).toBe(true);
  });

  it("page inválida (0 ou negativa) → erro", () => {
    expect(historyQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ page: "-1" }).success).toBe(false);
  });

  it("order inválido → erro", () => {
    const parsed = historyQuerySchema.safeParse({ order: "sideways" });

    expect(parsed.success).toBe(false);
  });

  it("from/to que não são ISO 8601 válidos → erro", () => {
    expect(historyQuerySchema.safeParse({ from: "not-a-date", to: "2026-07-02T00:00:00.000Z" }).success).toBe(
      false,
    );
    expect(historyQuerySchema.safeParse({ from: "2026-07-01T00:00:00.000Z", to: "nope" }).success).toBe(
      false,
    );
  });

  it("from > to → erro", () => {
    const parsed = historyQuerySchema.safeParse({
      from: "2026-07-02T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z",
    });

    expect(parsed.success).toBe(false);
  });

  it("from == to é aceito (intervalo de um instante)", () => {
    const parsed = historyQuerySchema.safeParse({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z",
    });

    expect(parsed.success).toBe(true);
  });

  it("intervalo maior que 366 dias → erro", () => {
    const parsed = historyQuerySchema.safeParse({
      from: "2025-01-01T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z",
    });

    expect(parsed.success).toBe(false);
  });

  it("intervalo de exatamente 366 dias é aceito", () => {
    const parsed = historyQuerySchema.safeParse({
      from: "2026-01-01T00:00:00.000Z",
      to: "2027-01-02T00:00:00.000Z", // 2027 não é bissexto, 2026 tampouco: 366 dias exatos
    });

    expect(parsed.success).toBe(true);
  });

  it("informar apenas from (sem to) é aceito — default é aplicado no service", () => {
    const parsed = historyQuerySchema.safeParse({ from: "2026-07-01T00:00:00.000Z" });

    expect(parsed.success).toBe(true);
  });
});

describe("exportQuerySchema (T8.1 — HIST-06, HIST-07, HIST-10)", () => {
  it("aceita from/to/format=csv válidos", () => {
    const parsed = exportQuerySchema.safeParse({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-02T00:00:00.000Z",
      format: "csv",
    });

    expect(parsed.success).toBe(true);
  });

  it("aceita format=xlsx", () => {
    const parsed = exportQuerySchema.safeParse({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-02T00:00:00.000Z",
      format: "xlsx",
    });

    expect(parsed.success).toBe(true);
  });

  it("format ausente usa default csv", () => {
    const parsed = exportQuerySchema.safeParse({});

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.format).toBe("csv");
    }
  });

  it("format inválido → erro", () => {
    const parsed = exportQuerySchema.safeParse({ format: "pdf" });

    expect(parsed.success).toBe(false);
  });

  it("from > to → erro", () => {
    const parsed = exportQuerySchema.safeParse({
      from: "2026-07-02T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z",
      format: "csv",
    });

    expect(parsed.success).toBe(false);
  });

  it("intervalo maior que 366 dias → erro", () => {
    const parsed = exportQuerySchema.safeParse({
      from: "2025-01-01T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z",
      format: "csv",
    });

    expect(parsed.success).toBe(false);
  });
});
