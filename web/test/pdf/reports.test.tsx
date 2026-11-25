import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DashboardReport } from "../../src/pdf/DashboardReport";
import { HistoryReport } from "../../src/pdf/HistoryReport";
import { ReportChart, yDomain } from "../../src/pdf/ReportChart";
import { TABLE_ROWS_PER_PAGE } from "../../src/pdf/drawReadingsTable";
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

  it("gera 3 folhas A4 numeradas com cabeçalho, condições atuais e resumo do período", () => {
    const { container } = render(
      <DashboardReport
        latest={latestFixture}
        series={series}
        period={{ range: "24h" }}
        generatedAt={GENERATED_AT}
      />,
    );

    const [first, second] = pages(container);
    expect(pages(container)).toHaveLength(3);
    expect(within(first!).getByText("Página 1 de 3")).toBeInTheDocument();
    expect(within(second!).getByText("Página 2 de 3")).toBeInTheDocument();

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
      <DashboardReport
        latest={undefined}
        series={{}}
        period={{ range: "30d" }}
        generatedAt={GENERATED_AT}
      />,
    );

    expect(screen.getAllByText("Sem sinal")).toHaveLength(5);
    // 5 tendências + 6 cards dos comparativos (3 pares × linhas/pontos).
    expect(screen.getAllByText("Sem dados no período")).toHaveLength(11);
    expect(screen.getAllByText("Últimos 30 dias").length).toBeGreaterThan(0);
  });
});

describe("DashboardReport — comparativos", () => {
  it("página 3 com os 3 pares, cada um em linhas (médias) e pontos (leituras)", () => {
    const { container } = render(
      <DashboardReport
        latest={latestFixture}
        series={{
          temperature_c: seriesFixture,
          humidity_pct: { ...seriesFixture, metric: "humidity_pct" },
          pressure_hpa: { ...seriesFixture, metric: "pressure_hpa" },
        }}
        readings={historyFixture.readings}
        period={{
          range: "custom",
          from: "2026-07-01T12:00:00.000Z",
          to: "2026-07-10T12:00:00.000Z",
        }}
        generatedAt={GENERATED_AT}
      />,
    );

    const third = pages(container)[2]!;
    expect(within(third).getByText("Página 3 de 3")).toBeInTheDocument();
    expect(within(third).getByRole("heading", { name: "Comparativos" })).toBeInTheDocument();
    expect(within(third).getAllByText("Temperatura e Umidade")).toHaveLength(2);
    expect(within(third).getAllByText("Umidade e Pressão")).toHaveLength(2);
    // 2 leituras × 2 grandezas em cada um dos 3 cards de pontos.
    expect(third.querySelectorAll("circle")).toHaveLength(12);
    // Período personalizado no cabeçalho.
    expect(
      within(pages(container)[0]!).getAllByText("01/07/2026 – 10/07/2026").length,
    ).toBeGreaterThan(0);
  });

  it("chuva no resumo: só máxima (por hora/dia) e total — mínima/média por intervalo não têm sentido físico", () => {
    const { container } = render(
      <DashboardReport
        latest={latestFixture}
        series={{ rain_mm: rainSeriesFixture }}
        period={{ range: "24h" }}
        generatedAt={GENERATED_AT}
      />,
    );

    const row = within(pages(container)[0]!).getByText("máxima em 1 hora").closest("tr")!;
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells.slice(1)).toEqual(["—", "—", "0,4 mm", "Total 0,5 mm"]);
  });
});

describe("HistoryReport", () => {
  it("só a capa (a tabela é texto no PDF), com a numeração já contando as folhas da tabela", () => {
    const readings = syntheticReadings(TABLE_ROWS_PER_PAGE * 2 + 1);
    const { container } = render(
      <HistoryReport
        readings={readings}
        from="2026-07-22T14:30:00.000Z"
        to="2026-07-23T14:30:00.000Z"
        generatedAt={GENERATED_AT}
      />,
    );

    expect(pages(container)).toHaveLength(1);
    expect(screen.getByText("Página 1 de 4")).toBeInTheDocument();
    expect(screen.getByText(String(readings.length))).toBeInTheDocument();
    expect(screen.queryByText(/ficaram de fora/)).not.toBeInTheDocument();
  });

  it("resumo da chuva: total, máximo em 1 h e dias com chuva (não mín/máx por leitura)", () => {
    render(
      <HistoryReport
        readings={syntheticReadings(24)}
        from="2026-07-22T14:30:00.000Z"
        to="2026-07-23T14:30:00.000Z"
        generatedAt={GENERATED_AT}
      />,
    );

    // 24 leituras de 0,2 mm a cada 5 min = 4,8 mm em 2 horas (12 por hora = 2,4 mm).
    expect(screen.getByText("Total no período")).toBeInTheDocument();
    expect(screen.getByText("4,8")).toBeInTheDocument();
    expect(screen.getByText("máx em 1 h: 2,4 mm")).toBeInTheDocument();
    expect(screen.getByText("1 dia com chuva")).toBeInTheDocument();
  });

  it("intervalo vazio: uma única folha com o estado vazio", () => {
    render(
      <HistoryReport
        readings={[]}
        from="2026-07-22T14:30:00.000Z"
        to="2026-07-23T14:30:00.000Z"
        generatedAt={GENERATED_AT}
      />,
    );

    expect(screen.getByText("Nenhuma leitura no intervalo")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
  });
});

describe("ReportChart", () => {
  const HOUR = 60 * 60 * 1000;
  const start = Date.parse("2026-07-23T00:00:00.000Z");
  const meta = { color: "#ea580c", digits: 1 };

  it("linha: quebra o traço nos nulos e rotula o eixo X em horas num período curto", () => {
    const { container } = render(
      <ReportChart
        series={[
          {
            ...meta,
            points: [
              { t: start, v: 20 },
              { t: start + HOUR, v: 21 },
              { t: start + 2 * HOUR, v: null },
              { t: start + 3 * HOUR, v: 22 },
              { t: start + 4 * HOUR, v: 23 },
            ],
          },
        ]}
        width={400}
        height={160}
      />,
    );

    // 2 segmentos (área + traço cada).
    expect(container.querySelectorAll("path")).toHaveLength(4);
    expect(container.textContent).toMatch(/\d{2}:\d{2}/);
  });

  it("domínio X é a janela pedida: dados no começo ocupam só o começo do eixo", () => {
    const { container } = render(
      <ReportChart
        series={[
          {
            ...meta,
            points: [
              { t: start, v: 20 },
              { t: start + HOUR, v: 21 },
            ],
          },
        ]}
        domain={[start, start + 10 * HOUR]}
        width={440}
        height={160}
      />,
    );

    const d = container.querySelectorAll("path")[1]!.getAttribute("d")!;
    const xs = Array.from(d.matchAll(/[ML](-?[\d.]+),/g), (m) => Number(m[1]));
    expect(Math.max(...xs)).toBeLessThan(400 / 5);
  });

  it("divisores de dia só acima de 2 dias", () => {
    const short = render(
      <ReportChart
        series={[
          {
            ...meta,
            points: [
              { t: start, v: 1 },
              { t: start + HOUR, v: 2 },
            ],
          },
        ]}
        domain={[start, start + 24 * HOUR]}
        width={400}
        height={160}
      />,
    );
    expect(short.container.querySelectorAll("[data-day-divider]")).toHaveLength(0);

    const long = render(
      <ReportChart
        series={[
          {
            ...meta,
            points: [
              { t: start, v: 1 },
              { t: start + HOUR, v: 2 },
            ],
          },
        ]}
        domain={[start + 12 * HOUR, start + 12 * HOUR + 5 * 24 * HOUR]}
        width={400}
        height={160}
      />,
    );
    expect(long.container.querySelectorAll("[data-day-divider]")).toHaveLength(5);
  });

  it("barras: um retângulo por valor positivo, eixo ancorado em zero", () => {
    const { container } = render(
      <ReportChart
        series={[
          {
            ...meta,
            points: [
              { t: start, v: 0 },
              { t: start + HOUR, v: 1.2 },
              { t: start + 2 * HOUR, v: 0.4 },
            ],
          },
        ]}
        kind="bar"
        bucketMs={HOUR}
        width={400}
        height={160}
      />,
    );

    expect(container.querySelectorAll("rect")).toHaveLength(2);
    expect(container.textContent).toContain("0,0");
  });

  it("2 séries: um eixo de cada lado, com a unidade de cada uma", () => {
    const { container } = render(
      <ReportChart
        series={[
          {
            ...meta,
            unit: "°C",
            points: [
              { t: start, v: 20 },
              { t: start + HOUR, v: 25 },
            ],
          },
          {
            color: "#0284c7",
            digits: 0,
            unit: "%",
            points: [
              { t: start, v: 60 },
              { t: start + HOUR, v: 80 },
            ],
          },
        ]}
        kind="dots"
        width={400}
        height={160}
      />,
    );

    expect(container.querySelectorAll("circle")).toHaveLength(4);
    expect(container.textContent).toContain("°C");
    expect(container.textContent).toContain("%");
  });

  it("um único ponto não divide por zero; sem valores mostra o estado vazio", () => {
    const { container } = render(
      <ReportChart
        series={[{ ...meta, points: [{ t: start, v: 20 }] }]}
        width={400}
        height={160}
      />,
    );
    expect(container.innerHTML).not.toContain("NaN");

    render(
      <ReportChart
        series={[{ ...meta, points: [{ t: start, v: null }] }]}
        width={400}
        height={160}
      />,
    );
    expect(screen.getByText("Sem dados no período")).toBeInTheDocument();
  });
});

describe("yDomain (limites físicos)", () => {
  it("umidade nunca passa de 100 % nem desce abaixo de 0", () => {
    const [min, max] = yDomain([5, 100], "line", { min: 0, max: 100 });
    expect(max).toBe(100);
    expect(min).toBe(0);
  });

  it("grandeza que pode ser negativa (temperatura) ganha folga dos dois lados", () => {
    const [min, max] = yDomain([-2, 8], "line");
    expect(min).toBeLessThan(-2);
    expect(max).toBeGreaterThan(8);
  });
});
