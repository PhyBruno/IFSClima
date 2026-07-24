import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../../src/components/EmptyState";

// Caso de uso padrão observado no design: tabela de histórico vazia
// (docs/design-extraction.md §5.7/§8.6) — texto exato confirmado por render.
const TABLE_EMPTY_TITLE = "Nenhum dado no período";
const TABLE_EMPTY_DESCRIPTION = "Ajuste o intervalo de datas ou os sensores selecionados";

describe("EmptyState", () => {
  it("renderiza o título e a descrição do caso 'tabela de histórico vazia'", () => {
    render(<EmptyState title={TABLE_EMPTY_TITLE} description={TABLE_EMPTY_DESCRIPTION} />);

    expect(screen.getByText(TABLE_EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.getByText(TABLE_EMPTY_DESCRIPTION)).toBeInTheDocument();
  });

  it("título é exposto como heading acessível", () => {
    render(<EmptyState title={TABLE_EMPTY_TITLE} />);

    expect(screen.getByRole("heading", { name: TABLE_EMPTY_TITLE })).toBeInTheDocument();
  });

  it("funciona sem description (não renderiza 'undefined' nem elemento vazio)", () => {
    render(<EmptyState title={TABLE_EMPTY_TITLE} />);

    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
    expect(screen.getByRole("heading")).toHaveTextContent(TABLE_EMPTY_TITLE);
  });

  it("funciona sem icon (não quebra, não deixa nó vazio)", () => {
    const { container } = render(<EmptyState title={TABLE_EMPTY_TITLE} />);

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it("renderiza o icon quando fornecido", () => {
    render(<EmptyState title={TABLE_EMPTY_TITLE} icon={<svg data-testid="empty-icon" />} />);

    expect(screen.getByTestId("empty-icon")).toBeInTheDocument();
  });
});
