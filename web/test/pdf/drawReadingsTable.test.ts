import { beforeAll, describe, expect, it, vi } from "vitest";
import jsPDF from "jspdf";
import {
  TABLE_ROWS_PER_PAGE,
  drawReadingsTable,
  tablePageCount,
} from "../../src/pdf/drawReadingsTable";
import type { HistoryReading } from "../../src/api-client";

let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
  return () => {
    process.env.TZ = originalTZ;
  };
});

function readings(count: number): HistoryReading[] {
  const start = Date.parse("2026-10-25T20:24:00.000Z");
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(start + i * 15 * 60_000).toISOString(),
    temperature_c: 20 + (i % 10) / 10,
    humidity_pct: null,
    pressure_hpa: 1011.25,
    rain_mm: i === 3 ? 0.4 : 0,
    uv_index: null,
  }));
}

/** jsPDF real (roda no Node), espiando o texto escrito. */
function draw(count: number) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const texts: string[] = [];
  const original = pdf.text.bind(pdf);
  vi.spyOn(pdf, "text").mockImplementation(((value: string, ...rest: unknown[]) => {
    texts.push(value);
    return (original as (...args: unknown[]) => jsPDF)(value, ...rest);
  }) as typeof pdf.text);
  const created = drawReadingsTable(pdf, {
    readings: readings(count),
    periodText: "25/10/2026 20:24 - 24/11/2026 20:24",
    documentTitle: "Relatório de Histórico",
    pagesBefore: 1,
  });
  return { pdf, texts, created };
}

describe("drawReadingsTable (tabela do Histórico em texto no PDF)", () => {
  it("954 leituras (o caso do relatório cortado): TODAS na tabela, 50 por folha", () => {
    const { pdf, texts, created } = draw(954);

    expect(created).toBe(Math.ceil(954 / TABLE_ROWS_PER_PAGE));
    // Capa (já existente) + folhas da tabela.
    expect(pdf.getNumberOfPages()).toBe(1 + created);
    // Numeração de 1 a 954, sem buraco nem repetição.
    const numbers = texts.filter((text) => /^\d+$/.test(text)).map(Number);
    expect(numbers).toEqual(Array.from({ length: 954 }, (_, i) => i + 1));
    expect(texts).toContain(`Página 2 de ${1 + created}`);
    expect(texts).toContain(`Página ${1 + created} de ${1 + created}`);
  });

  it("formata em pt-BR sem milhar e usa '-' para valor ausente", () => {
    const { texts } = draw(5);

    expect(texts).toContain("25/10/2026 20:24");
    expect(texts).toContain("1011,3");
    expect(texts).toContain("0,4");
    expect(texts).toContain("-");
    expect(texts.some((text) => text.includes("leituras 1-5 de 5"))).toBe(true);
  });

  it("tablePageCount: 0 sem leituras, arredonda para cima", () => {
    expect(tablePageCount(0)).toBe(0);
    expect(tablePageCount(1)).toBe(1);
    expect(tablePageCount(TABLE_ROWS_PER_PAGE)).toBe(1);
    expect(tablePageCount(TABLE_ROWS_PER_PAGE + 1)).toBe(2);
  });
});
