import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "../../src/components/StatusPill";

describe("StatusPill", () => {
  it("variante 'card': renderiza texto 'Online' quando online=true", () => {
    render(<StatusPill variant="card" online />);

    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("variante 'inline': renderiza texto 'Estação online' quando online=true", () => {
    render(<StatusPill variant="inline" online />);

    expect(screen.getByText("Estação online")).toBeInTheDocument();
  });

  it("estado offline muda o texto (card) e aplica cor de alerta (não só o dot)", () => {
    render(<StatusPill variant="card" online={false} />);

    const text = screen.getByText("Offline");
    expect(text).toBeInTheDocument();
    expect(text).toHaveClass("text-status-negative");
  });

  it("estado offline muda o texto (inline) e aplica cor de alerta", () => {
    render(<StatusPill variant="inline" online={false} />);

    const text = screen.getByText("Estação offline");
    expect(text).toHaveClass("text-status-negative");
  });

  it("estado online aplica a cor de status.online (distinta da offline)", () => {
    render(<StatusPill variant="card" online />);

    expect(screen.getByText("Online")).toHaveClass("text-status-online-text");
  });

  it("lastReadingAt ausente não renderiza a linha secundária nem 'undefined'", () => {
    render(<StatusPill variant="card" online />);

    expect(screen.queryByText(/última leitura/i)).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("lastReadingAt como string exibe a linha 'Última leitura: HH:MM' (variante card)", () => {
    render(<StatusPill variant="card" online lastReadingAt="14:32" />);

    expect(screen.getByText("Última leitura: 14:32")).toBeInTheDocument();
  });

  it("lastReadingAt como Date é formatado como HH:MM", () => {
    const date = new Date(2026, 0, 1, 9, 5);
    render(<StatusPill variant="card" online lastReadingAt={date} />);

    expect(screen.getByText("Última leitura: 09:05")).toBeInTheDocument();
  });

  it("lastReadingAt na variante inline aparece à direita, sem quebrar quando ausente", () => {
    const { rerender } = render(<StatusPill variant="inline" online lastReadingAt="10:00" />);
    expect(screen.getByText("10:00")).toBeInTheDocument();

    rerender(<StatusPill variant="inline" online />);
    expect(screen.queryByText("10:00")).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("a11y: o texto do status está sempre presente (não depende só do dot/cor)", () => {
    const { rerender } = render(<StatusPill variant="card" online />);
    expect(screen.getByText(/online/i)).toBeInTheDocument();

    rerender(<StatusPill variant="card" online={false} />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });
});
