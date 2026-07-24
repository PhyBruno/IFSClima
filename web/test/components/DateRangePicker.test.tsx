import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateRangePicker } from "../../src/components/DateRangePicker";

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
});
