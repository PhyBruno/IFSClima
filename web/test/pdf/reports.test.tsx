import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DashboardReport } from "../../src/pdf/DashboardReport";
import { HistoryReport, MAX_TABLE_ROWS, ROWS_PER_PAGE } from "../../src/pdf/HistoryReport";
import { ReportChart } from "../../src/pdf/ReportChart";
import type { HistoryReading, SeriesResponse } from "../../src/api-client";
import {
  historyFixture,
  latestFixture,
  rainSeriesFixture,
  seriesFixture,
} from "../fixtures/readings";

const GENERATED_AT = new Date("2026-07-23T15:00:00.000Z");

function pages(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-report-page]"));
}

function syntheticReadings(count: number): HistoryReading[] {
  const start = new Date("2026-07-23T14:30:00.000Z").getTime();
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(start - i * 5 * 60 * 1000).toISOString(),
    temperature_c: 20 + (i % 7),
    humidity_pct: 60,
    pressure_hpa: 1013,
    rain_mm: 0.2,
    uv_index: 3,
  }));
}

describe("DashboardReport", () => {
  const series: Partial<Record<string, SeriesResponse>> = {
    temperature_c: seriesFixture,
    humidity_pct: { ...seriesFixture, metric: "humidity_pct" },
    rain_mm: rainSeriesFixture,
  };

  it("gera 2 folhas A4 numeradas com cabeçalho, condições atuais e resumo do período", () => {
    const { container } = render(
      <DashboardReport
        latest={latestFixture}
        series={series}
        range="24h"
        generatedAt={GENERATED_AT}
      />,
    );

    const [first, second] = pages(container);
    expect(pages(container)).toHaveLength(2);
    expect(within(first!).getByText("Página 1 de 2")).toBeInTheDocument();
    expect(within(second!).getByText("Página 2 de 2")).toBeInTheDocument();

    expect(
      within(first!).getByRole("heading", { name: "Painel de Monitoramento" }),
    ).toBeInTheDocument();
    expect(within(first!).getAllByText("Últimas 24 horas").length).toBeGreaterThan(0);
    expect(within(first!).getByText("23/07/2026 14:30")).toBeInTheDocument();
    expect(within(first!).getByText("24,7")).toBeInTheDocument();
    // Criticidade do UV (5,3 → "Moderado", escala OMS).
    expect(within(first!).getByText("Moderado")).toBeInTheDocument();
    // Chuva: total do período no resumo (0,4 + 0,1).
    expect(within(first!).getByText("Total 0,5 mm")).toBeInTheDocument();

    expect(
      within(second!).getByRole("heading", { name: "Tendências do período" }),
    ).toBeInTheDocument();
  });

  it("sem leitura atual os cards mostram 'Sem sinal' e séries ausentes mostram 'Sem dados no período'", () => {
    render(
      <DashboardReport latest={undefined} series={{}} range="30d" generatedAt={GENERATED_AT} />,
    );

    expect(screen.getAllByText("Sem sinal")).toHaveLength(5);
    expect(screen.getAllByText("Sem dados no período")).toHaveLength(5);
    expect(screen.getAllByText("Últimos 30 dias").length).toBeGreaterThan(0);
  });
});

describe("HistoryReport", () => {
  it("página de resumo + tabela: poucas leituras cabem em uma folha de tabela", () => {
    const { container } = render(
      <HistoryReport
        readings={historyFixture.readings}
        total={historyFixture.total}
        from={historyFixture.from}
        to={historyFixture.to}
        generatedAt={GENERATED_AT}
      />,
    );

    const [summaryPage, tablePage] = pages(container);
    expect(pages(container)).toHaveLength(2);
    expect(within(summaryPage!).getByText("Resumo estatístico")).toBeInTheDocument();
    expect(
      within(summaryPage!).getByText("Calculado sobre todas as leituras do intervalo"),
    ).toBeInTheDocument();
    expect(within(tablePage!).getByText("Página 2 de 2")).toBeInTheDocument();
    expect(within(tablePage!).getAllByRole("row")).toHaveLength(1 + historyFixture.readings.length);
    expect(within(tablePage!).getByText("23/07/2026 14:30")).toBeInTheDocument();
    expect(within(tablePage!).getByText("24,7")).toBeInTheDocument();
  });

  it("pagina a tabela em ROWS_PER_PAGE linhas por folha", () => {
    const readings = syntheticReadings(ROWS_PER_PAGE * 2 + 1);
    const { container } = render(
      <HistoryReport
        readings={readings}
        total={readings.length}
        from={historyFixture.from}
        to={historyFixture.to}
        generatedAt={GENERATED_AT}
      />,
    );

    const all = pages(container);
    expect(all).toHaveLength(4);
    expect(within(all[3]!).getByText("Página 4 de 4")).toBeInTheDocument();
    expect(within(all[3]!).getAllByRole("row")).toHaveLength(2);
  });

  it("acima de MAX_TABLE_ROWS a tabela é cortada e avisa quantas leituras ficaram de fora", () => {
    const readings = syntheticReadings(MAX_TABLE_ROWS + 10);
    const { container } = render(
      <HistoryReport
        readings={readings}
        total={readings.length + 100}
        from={historyFixture.from}
        to={historyFixture.to}
        generatedAt={GENERATED_AT}
      />,
    );

    const all = pages(container);
    expect(all).toHaveLength(1 + MAX_TABLE_ROWS / ROWS_PER_PAGE);
    expect(
      within(all.at(-1)!).getByText(/110 leituras mais antigas ficaram de fora/),
    ).toBeInTheDocument();
    expect(
      within(all[0]!).getByText(/calculados sobre as .* leituras mais recentes/),
    ).toBeInTheDocument();
  });

  it("intervalo vazio: uma única folha com o estado vazio", () => {
    const { container } = render(
      <HistoryReport
        readings={[]}
        total={0}
        from={historyFixture.from}
        to={historyFixture.to}
        generatedAt={GENERATED_AT}
      />,
    );

    expect(pages(container)).toHaveLength(1);
    expect(screen.getByText("Nenhuma leitura no intervalo")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
  });
});

describe("ReportChart", () => {
  const points = [
    { t: Date.parse("2026-07-23T12:00:00.000Z"), v: 20 },
    { t: Date.parse("2026-07-23T13:00:00.000Z"), v: null },
    { t: Date.parse("2026-07-23T14:00:00.000Z"), v: 22 },
    { t: Date.parse("2026-07-23T15:00:00.000Z"), v: 24 },
  ];

  it("linha: quebra o traço nos nulos e rotula o eixo X em horas quando o período é curto", () => {
    const { container } = render(
      <ReportChart points={points} color="#ea580c" width={400} height={160} digits={1} />,
    );

    // 2 segmentos (antes/depois do nulo), cada um com área + linha.
    expect(container.querySelectorAll("path")).toHaveLength(4);
    expect(container.querySelector("circle")).not.toBeNull();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByText("15:00")).toBeInTheDocument();
  });

  it("barras: um retângulo por valor positivo, eixo ancorado em zero", () => {
    const { container } = render(
      <ReportChart
        points={points}
        color="#0891b2"
        kind="bar"
        width={400}
        height={160}
        digits={1}
      />,
    );

    expect(container.querySelectorAll("rect")).toHaveLength(3);
    expect(screen.getByText("0,0")).toBeInTheDocument();
  });

  it("buckets diários (utcDays) e períodos longos rotulam por dia", () => {
    const daily = [
      { t: Date.parse("2026-07-01T00:00:00.000Z"), v: 1 },
      { t: Date.parse("2026-07-10T00:00:00.000Z"), v: 1 },
    ];
    render(<ReportChart points={daily} color="#000" width={400} height={160} digits={0} utcDays />);

    expect(screen.getByText("01/07")).toBeInTheDocument();
    expect(screen.getByText("10/07")).toBeInTheDocument();
  });

  it("um único ponto não divide por zero; sem valores mostra o estado vazio", () => {
    const single = [{ t: Date.parse("2026-07-23T12:00:00.000Z"), v: 5 }];
    const { container, rerender } = render(
      <ReportChart points={single} color="#000" width={400} height={160} digits={0} />,
    );
    expect(container.querySelector("circle")?.getAttribute("cx")).not.toBe("NaN");

    rerender(
      <ReportChart points={[{ t: 0, v: null }]} color="#000" width={400} height={160} digits={0} />,
    );
    expect(screen.getByText("Sem dados no período")).toBeInTheDocument();
  });
});
