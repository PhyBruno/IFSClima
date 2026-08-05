import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDayMonth, formatDayMonthUTC, formatTime } from "../../src/utils/formatTime";

/**
 * `formatTime`/`formatDayMonth` (F6 T6.4 — design.md "Formatação": util
 * `formatTime(utc, tz)` UTC→local; spec.md edge case "fuso do usuário").
 * Usa `Date#getHours`/`getDate` (fuso LOCAL do processo), então o TZ do
 * processo é fixado em UTC para os asserts ficarem determinísticos
 * independente da máquina/CI que roda o teste — mesma estratégia já usada em
 * `test/components/ChartsSection.test.tsx`.
 */
let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

describe("formatTime", () => {
  it("formata um ISO UTC em HH:MM (fuso local)", () => {
    expect(formatTime("2026-07-23T14:30:00.000Z")).toBe("14:30");
  });

  it("preenche com zero à esquerda horas/minutos < 10", () => {
    expect(formatTime("2026-07-23T05:07:00.000Z")).toBe("05:07");
  });

  it("null/undefined (sem timestamp ainda) retorna placeholder, sem lançar", () => {
    expect(formatTime(null)).toBe("--:--");
    expect(formatTime(undefined)).toBe("--:--");
  });

  it("string inválida não lança nem produz 'NaN:NaN' — cai no placeholder", () => {
    expect(formatTime("não é uma data")).toBe("--:--");
  });
});

describe("formatDayMonth", () => {
  it("formata um ISO UTC em DD/MM (fuso local)", () => {
    expect(formatDayMonth("2026-07-01T00:00:00.000Z")).toBe("01/07");
    expect(formatDayMonth("2026-07-20T00:00:00.000Z")).toBe("20/07");
  });

  it("null/undefined retorna placeholder, sem lançar", () => {
    expect(formatDayMonth(null)).toBe("--/--");
    expect(formatDayMonth(undefined)).toBe("--/--");
  });

  it("string inválida não lança — cai no placeholder", () => {
    expect(formatDayMonth("não é uma data")).toBe("--/--");
  });
});

/**
 * `formatDayMonthUTC` — usada só para buckets de granularidade "day"
 * (`range=30d`, `date_trunc('day', ...)` calculado em UTC pela sessão do
 * Postgres — `api/src/db/client.ts`). Diferente de `formatDayMonth`, NÃO
 * reinterpreta o instante no fuso local: o bucket já representa um DIA
 * CALENDÁRIO UTC, não um instante para relocalizar. Bug real corrigido aqui:
 * meia-noite UTC de um dia, formatada com `Date#getDate()` (fuso local) num
 * fuso negativo (ex. Brasil, UTC-3), cai no dia ANTERIOR local — daí o teste
 * abaixo forçar TZ diferente de UTC, de propósito, para expor exatamente
 * esse desalinhamento.
 */
describe("formatDayMonthUTC", () => {
  let originalTZ: string | undefined;
  beforeAll(() => {
    originalTZ = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
  });
  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it("mantém o dia UTC do bucket mesmo com o processo rodando em fuso local negativo (UTC-3)", () => {
    // Meia-noite UTC de 04/08 — em fuso local UTC-3 seria 03/08 21:00, mas o
    // bucket representa o dia UTC 04/08 (date_trunc em UTC), não deve mudar.
    expect(formatDayMonthUTC("2026-08-04T00:00:00.000Z")).toBe("04/08");
  });

  it("null/undefined retorna placeholder, sem lançar", () => {
    expect(formatDayMonthUTC(null)).toBe("--/--");
    expect(formatDayMonthUTC(undefined)).toBe("--/--");
  });

  it("string inválida não lança — cai no placeholder", () => {
    expect(formatDayMonthUTC("não é uma data")).toBe("--/--");
  });
});
