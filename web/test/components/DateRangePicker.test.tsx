import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DateRangePicker,
  localDateStringToUtcDayBounds,
} from "../../src/components/DateRangePicker";

const FIXED_NOW = new Date("2026-07-23T14:30:00.000Z");
const fixedNow = () => FIXED_NOW;

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

  it("'Personalizado' revela dois inputs de data acessíveis (labels associados) e não dispara onChange sozinho", () => {
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} now={fixedNow} />);

    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));

    expect(screen.getByLabelText("De")).toBeInTheDocument();
    expect(screen.getByLabelText("Até")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("custom: preencher só 'De' não dispara onChange; preencher os dois dispara com o intervalo do dia inteiro", () => {
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} now={fixedNow} />);

    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-07-01" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-07-10" } });

    expect(onChange).toHaveBeenCalledWith("2026-07-01T00:00:00.000Z", "2026-07-10T23:59:59.999Z");
  });

  it("custom: preencher 'Até' primeiro e depois 'De' também dispara onChange com ambas as datas", () => {
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} now={fixedNow} />);

    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-07-10" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-07-01" } });

    expect(onChange).toHaveBeenCalledWith("2026-07-01T00:00:00.000Z", "2026-07-10T23:59:59.999Z");
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

  // Achado F8 (revisão de código, MÉDIA): custom misturava fronteiras UTC
  // com exibição em fuso local — `emitCustomIfComplete` tratava a string do
  // `<input type="date">` (dia do calendário LOCAL) como se já fosse UTC.
  describe("localDateStringToUtcDayBounds (conversão fuso local -> limites UTC do dia)", () => {
    const ORIGINAL_TZ = process.env.TZ;

    afterEach(() => {
      process.env.TZ = ORIGINAL_TZ;
    });

    it("em UTC-3 (fuso do projeto/README), converte o dia local pros limites UTC reais — não trata a string como se já fosse UTC", () => {
      process.env.TZ = "America/Sao_Paulo"; // UTC-3 o ano todo (sem DST desde 2019)

      const [from, to] = localDateStringToUtcDayBounds("2026-07-01");

      // 01/07 00:00:00.000 -03:00 == 01/07T03:00:00.000Z (NÃO 01/07T00:00:00.000Z,
      // que seria o resultado da concatenação ingênua corrigida por este achado).
      expect(from).toBe("2026-07-01T03:00:00.000Z");
      // 01/07 23:59:59.999 -03:00 == 02/07T02:59:59.999Z
      expect(to).toBe("2026-07-02T02:59:59.999Z");
    });

    it("em UTC (fuso do ambiente de teste default), os limites coincidem com a concatenação direta", () => {
      process.env.TZ = "UTC";

      const [from, to] = localDateStringToUtcDayBounds("2026-07-01");

      expect(from).toBe("2026-07-01T00:00:00.000Z");
      expect(to).toBe("2026-07-01T23:59:59.999Z");
    });
  });

  it("custom em fuso UTC-3: o dia local escolhido pelo usuário emite os limites UTC corretos (não desloca ~3h como a concatenação ingênua faria)", () => {
    process.env.TZ = "America/Sao_Paulo";
    try {
      const onChange = vi.fn();
      render(<DateRangePicker onChange={onChange} now={fixedNow} />);

      fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
      fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-07-01" } });
      fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-07-01" } });

      expect(onChange).toHaveBeenCalledWith("2026-07-01T03:00:00.000Z", "2026-07-02T02:59:59.999Z");
    } finally {
      process.env.TZ = "UTC";
    }
  });

  // Achado F8 (revisão de código, MÉDIA): sem guarda client-side para custom
  // `from > to` ou intervalo > 366 dias (MAX_RANGE_DAYS, api/src/schemas/history.ts).
  describe("validação client-side do intervalo custom", () => {
    it("De > Até (invertido): mostra mensagem de erro e NÃO dispara onChange", () => {
      const onChange = vi.fn();
      render(<DateRangePicker onChange={onChange} now={fixedNow} />);

      fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
      fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-07-10" } });
      fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-07-01" } });

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("intervalo maior que 366 dias: mostra mensagem de erro e NÃO dispara onChange", () => {
      const onChange = vi.fn();
      render(<DateRangePicker onChange={onChange} now={fixedNow} />);

      fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
      fireEvent.change(screen.getByLabelText("De"), { target: { value: "2020-01-01" } });
      fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-01-01" } });

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("corrigir para um intervalo válido depois de um erro limpa a mensagem e dispara onChange normalmente", () => {
      const onChange = vi.fn();
      render(<DateRangePicker onChange={onChange} now={fixedNow} />);

      fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
      fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-07-10" } });
      fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-07-01" } });
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-07-20" } });

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(onChange).toHaveBeenCalledWith("2026-07-10T00:00:00.000Z", "2026-07-20T23:59:59.999Z");
    });

    it("exatamente 366 dias de intervalo é aceito (não excede o limite)", () => {
      const onChange = vi.fn();
      render(<DateRangePicker onChange={onChange} now={fixedNow} />);

      // 2024 é bissexto: 01/01/2024 -> 01/01/2025 são exatamente 366 dias.
      fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
      fireEvent.change(screen.getByLabelText("De"), { target: { value: "2024-01-01" } });
      fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2025-01-01" } });

      expect(onChange).toHaveBeenCalledWith("2024-01-01T00:00:00.000Z", "2025-01-01T23:59:59.999Z");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
