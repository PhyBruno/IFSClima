import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionBanner } from "../../src/components/ConnectionBanner";

/**
 * `ConnectionBanner` (F6 T6.4 — design.md "Erro de rede": React Query
 * `keepPreviousData` + banner "reconectando", nunca tela branca, UI-10).
 * Componente puro (não consulta hooks/rede diretamente) — quem decide
 * QUANDO mostrar (`show`) é o chamador (`SensorGrid`/`ChartsSection`), com
 * base no estado de erro dos hooks de dados (T6.1).
 *
 * `lastUpdatedAt` é formatado via `formatTime` (fuso LOCAL do processo) —
 * TZ fixado em UTC para o assert de horário ficar determinístico
 * independente da máquina/CI (mesma estratégia de `ChartsSection.test.tsx`).
 */
let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

describe("ConnectionBanner", () => {
  it("show=false não renderiza nada (sem ocupar espaço/poluir a árvore)", () => {
    const { container } = render(<ConnectionBanner show={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("show=true sinaliza offline/reconectando com aria-live (nunca tela branca, UI-10)", () => {
    render(<ConnectionBanner show={true} />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/reconectando/i)).toBeInTheDocument();
    // Reaproveita StatusPill (F5) — variante offline.
    expect(screen.getByText(/estação offline/i)).toBeInTheDocument();
  });

  it("com lastUpdatedAt, exibe o horário local (UTC→local, formatTime) da última leitura conhecida", () => {
    render(<ConnectionBanner show={true} lastUpdatedAt="2026-07-23T14:30:00.000Z" />);

    expect(screen.getByText(/14:30/)).toBeInTheDocument();
  });

  it("sem lastUpdatedAt, não quebra nem mostra horário inventado", () => {
    render(<ConnectionBanner show={true} lastUpdatedAt={null} />);

    expect(screen.queryByText(/--:--/)).not.toBeInTheDocument();
  });
});
