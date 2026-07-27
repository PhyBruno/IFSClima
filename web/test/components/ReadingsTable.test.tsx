import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadingsTable } from "../../src/components/ReadingsTable";
import { historyFixture } from "../fixtures/readings";

describe("ReadingsTable", () => {
  it("lista timestamp (fuso local) + os 5 sensores por leitura", () => {
    render(
      <ReadingsTable
        readings={historyFixture.readings}
        page={1}
        pageSize={50}
        total={2}
        onPageChange={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole("row");
    // 1 cabeçalho + 2 leituras.
    expect(rows).toHaveLength(3);
    expect(screen.getByText("24.7")).toBeInTheDocument();
    expect(screen.getByText("61.2")).toBeInTheDocument();
    expect(screen.getByText("1013.4")).toBeInTheDocument();
    expect(screen.getByText("0.4")).toBeInTheDocument();
    expect(screen.getByText("5.3")).toBeInTheDocument();
  });

  it("HIST-03: sensor nulo mostra '—', não '0'/'NaN'", () => {
    render(
      <ReadingsTable
        readings={historyFixture.readings}
        page={1}
        pageSize={50}
        total={2}
        onPageChange={vi.fn()}
      />,
    );

    // Segunda leitura da fixture: rain_mm e uv_index são null.
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("HIST-04: intervalo vazio mostra EmptyState, não uma tabela vazia", () => {
    render(<ReadingsTable readings={[]} page={1} pageSize={50} total={0} onPageChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /nenhum dado no período/i })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("HIST-02: mostra 'Página X de Y' calculado a partir de total/pageSize", () => {
    render(
      <ReadingsTable
        readings={historyFixture.readings}
        page={1}
        pageSize={50}
        total={120}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
  });

  it("HIST-02: 'Anterior' desabilitado na primeira página; 'Próxima' habilitado", () => {
    render(
      <ReadingsTable
        readings={historyFixture.readings}
        page={1}
        pageSize={50}
        total={120}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Próxima" })).toBeEnabled();
  });

  it("HIST-02: 'Próxima' desabilitado na última página; 'Anterior' habilitado", () => {
    render(
      <ReadingsTable
        readings={historyFixture.readings}
        page={3}
        pageSize={50}
        total={120}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();
  });

  it("clicar em 'Próxima'/'Anterior' chama onPageChange com a página certa", () => {
    const onPageChange = vi.fn();
    render(
      <ReadingsTable
        readings={historyFixture.readings}
        page={2}
        pageSize={50}
        total={120}
        onPageChange={onPageChange}
      />,
    );

    screen.getByRole("button", { name: "Próxima" }).click();
    expect(onPageChange).toHaveBeenCalledWith(3);

    screen.getByRole("button", { name: "Anterior" }).click();
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
