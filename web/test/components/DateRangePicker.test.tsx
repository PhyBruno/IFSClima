import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DateRangePicker,
  localDayBoundsToUtc,
  resolveCustomRange,
} from "../../src/components/DateRangePicker";

const FIXED_NOW = new Date("2026-07-23T14:30:00.000Z");
const fixedNow = () => FIXED_NOW;

/**
 * O `Calendar` do shadcn marca cada dia com `data-day` no formato do locale
 * (`DD/MM/AAAA` em pt-BR) — seletor estável, independente do texto do
 * `aria-label` gerado pelo react-day-picker. `showOutsideDays={false}` no
 * componente garante um único botão por dia.
 */
function dayButton(day: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`[data-day="${day}"]`);
  if (!button) {
    throw new Error(`Dia ${day} não está visível no calendário`);
  }
  return button;
}

function openCustom() {
  fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
}

describe("DateRangePicker", () => {
  it("renderiza os 4 presets (24h/7d/30d/Personalizado)", () => {
    render(<DateRangePicker onChange={vi.fn()} now={fixedNow} />);

    expect(screen.getByRole("button", { name: "Últimas 24h" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 dias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 dias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personalizado" })).toBeInTheDocument();
  });

  it("'Últimas 24h' dispara onChange com from = now-24h e to = now", () => {
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} now={fixedNow} />);

    fireEvent.click(screen.getByRole("button", { name: "Últimas 24h" }));

    expect(onChange).toHaveBeenCalledWith("2026-07-22T14:30:00.000Z", "2026-07-23T14:30:00.000Z");
  });

  it("'7 dias' dispara onChange com from = now-7d", () => {
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} now={fixedNow} />);

    fireEvent.click(screen.getByRole("button", { name: "7 dias" }));

    expect(onChange).toHaveBeenCalledWith("2026-07-16T14:30:00.000Z", "2026-07-23T14:30:00.000Z");
  });

  it("'30 dias' dispara onChange com from = now-30d", () => {
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} now={fixedNow} />);

    fireEvent.click(screen.getByRole("button", { name: "30 dias" }));

    expect(onChange).toHaveBeenCalledWith("2026-06-23T14:30:00.000Z", "2026-07-23T14:30:00.000Z");
  });

  it("preset ativo é marcado com aria-pressed (default 'Últimas 24h')", () => {
    render(<DateRangePicker onChange={vi.fn()} now={fixedNow} />);

    expect(screen.getByRole("button", { name: "Últimas 24h" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "7 dias" })).toHaveAttribute("aria-pressed", "false");
  });

  it("respeita defaultPreset diferente de '24h'", () => {
    render(<DateRangePicker onChange={vi.fn()} now={fixedNow} defaultPreset="7d" />);

    expect(screen.getByRole("button", { name: "7 dias" })).toHaveAttribute("aria-pressed", "true");
  });

  describe("Personalizado (calendário do shadcn)", () => {
    it("abre o calendário (mês atual e o anterior) sem disparar onChange sozinho", () => {
      const onChange = vi.fn();
      render(<DateRangePicker onChange={onChange} now={fixedNow} />);

      openCustom();

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(dayButton("01/06/2026")).toBeInTheDocument();
      expect(dayButton("23/07/2026")).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("dias futuros ficam desabilitados", () => {
      render(<DateRangePicker onChange={vi.fn()} now={fixedNow} />);

      openCustom();

      expect(dayButton("24/07/2026")).toBeDisabled();
      expect(dayButton("23/07/2026")).toBeEnabled();
    });

    it("'Aplicar' só habilita com início e fim escolhidos; aplicar emite o intervalo do dia inteiro e fecha o popover", () => {
      const onChange = vi.fn();
      render(<DateRangePicker onChange={onChange} now={fixedNow} />);

      openCustom();
      const apply = screen.getByRole("button", { name: "Aplicar" });
      expect(apply).toBeDisabled();

      fireEvent.click(dayButton("01/07/2026"));
      fireEvent.click(dayButton("10/07/2026"));
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByText("01/07/2026 – 10/07/2026 · 10 dias")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

      expect(onChange).toHaveBeenCalledWith("2026-07-01T00:00:00.000Z", "2026-07-10T23:59:59.999Z");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "01/07/2026 – 10/07/2026" })).toBeInTheDocument();
    });

    it("em fuso UTC-3: o dia local escolhido emite os limites UTC corretos (não desloca ~3h)", () => {
      process.env.TZ = "America/Sao_Paulo";
      try {
        const onChange = vi.fn();
        render(<DateRangePicker onChange={onChange} now={fixedNow} />);

        openCustom();
        fireEvent.click(dayButton("01/07/2026"));
        fireEvent.click(dayButton("02/07/2026"));
        fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

        expect(onChange).toHaveBeenCalledWith(
          "2026-07-01T03:00:00.000Z",
          "2026-07-03T02:59:59.999Z",
        );
      } finally {
        process.env.TZ = "UTC";
      }
    });

    it("trocar para um preset depois do Personalizado esconde o calendário e emite o preset", () => {
      const onChange = vi.fn();
      render(<DateRangePicker onChange={onChange} now={fixedNow} />);

      openCustom();
      fireEvent.click(screen.getByRole("button", { name: "7 dias" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onChange).toHaveBeenCalledWith("2026-07-16T14:30:00.000Z", "2026-07-23T14:30:00.000Z");
    });
  });

  // Achado F8 (revisão de código, MÉDIA): custom misturava fronteiras UTC
  // com exibição em fuso local — o dia do calendário LOCAL era tratado como
  // se já fosse UTC.
  describe("localDayBoundsToUtc (dia local -> limites UTC do dia)", () => {
    const ORIGINAL_TZ = process.env.TZ;

    afterEach(() => {
      process.env.TZ = ORIGINAL_TZ;
    });

    it("em UTC-3 (fuso do projeto/README), converte o dia local pros limites UTC reais", () => {
      process.env.TZ = "America/Sao_Paulo"; // UTC-3 o ano todo (sem DST desde 2019)

      const [from, to] = localDayBoundsToUtc(new Date(2026, 6, 1));

      expect(from).toBe("2026-07-01T03:00:00.000Z");
      expect(to).toBe("2026-07-02T02:59:59.999Z");
    });

    it("em UTC, os limites coincidem com meia-noite/fim do dia UTC", () => {
      process.env.TZ = "UTC";

      const [from, to] = localDayBoundsToUtc(new Date(2026, 6, 1, 15, 45));

      expect(from).toBe("2026-07-01T00:00:00.000Z");
      expect(to).toBe("2026-07-01T23:59:59.999Z");
    });
  });

  // Achado F8 (revisão de código, MÉDIA): sem guarda client-side para
  // intervalo > 366 dias (MAX_RANGE_DAYS, api/src/schemas/history.ts).
  describe("resolveCustomRange (validação do intervalo custom)", () => {
    it("intervalo válido vira os limites UTC do primeiro e do último dia", () => {
      expect(resolveCustomRange(new Date(2026, 6, 1), new Date(2026, 6, 10))).toEqual({
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-10T23:59:59.999Z",
      });
    });

    it("exatamente 366 dias é aceito (2024 é bissexto: 01/01/2024 -> 01/01/2025)", () => {
      expect(resolveCustomRange(new Date(2024, 0, 1), new Date(2025, 0, 1))).toEqual({
        from: "2024-01-01T00:00:00.000Z",
        to: "2025-01-01T23:59:59.999Z",
      });
    });

    it("mais de 366 dias devolve erro", () => {
      expect(resolveCustomRange(new Date(2020, 0, 1), new Date(2026, 0, 1))).toEqual({
        error: "O intervalo não pode ser maior que 366 dias.",
      });
    });

    it("início depois do fim devolve erro", () => {
      expect(resolveCustomRange(new Date(2026, 6, 10), new Date(2026, 6, 1))).toEqual({
        error: "A data inicial não pode ser depois da data final.",
      });
    });
  });
});
