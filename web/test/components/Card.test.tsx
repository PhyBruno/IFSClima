import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../../src/components/Card";

describe("Card", () => {
  it("renderiza os children recebidos", () => {
    render(
      <Card>
        <p>Conteúdo do card</p>
      </Card>,
    );

    expect(screen.getByText("Conteúdo do card")).toBeInTheDocument();
  });

  it("aplica as classes de superfície/borda/radius do tema por padrão", () => {
    render(<Card data-testid="card">conteúdo</Card>);

    const card = screen.getByTestId("card");
    expect(card).toHaveClass("bg-surface-card", "border", "border-border-default");
    // radius responsivo: 14px mobile (base), 16px desktop (§3.2)
    expect(card).toHaveClass("rounded-14", "md:rounded-2xl");
  });

  it("não aplica shadow-card por padrão (cards são flat, §3.3/§8.8)", () => {
    render(<Card data-testid="card">conteúdo</Card>);

    expect(screen.getByTestId("card")).not.toHaveClass("shadow-card");
  });

  it("aplica shadow-card quando a prop shadow é ligada explicitamente", () => {
    render(
      <Card data-testid="card" shadow>
        conteúdo
      </Card>,
    );

    expect(screen.getByTestId("card")).toHaveClass("shadow-card");
  });

  it("aceita className extra sem substituir as classes base", () => {
    render(
      <Card data-testid="card" className="custom-class">
        conteúdo
      </Card>,
    );

    const card = screen.getByTestId("card");
    expect(card).toHaveClass("bg-surface-card", "custom-class");
  });

  it("radius customizado substitui o radius padrão (não deixa as duas classes coexistindo)", () => {
    render(
      <Card data-testid="card" radius="rounded-xl">
        conteúdo
      </Card>,
    );

    const card = screen.getByTestId("card");
    expect(card).toHaveClass("rounded-xl");
    expect(card).not.toHaveClass("rounded-14");
    expect(card).not.toHaveClass("md:rounded-2xl");
  });

  it("padding='none' não aplica nenhuma classe de padding, permitindo controle externo via className", () => {
    render(
      <Card data-testid="card" padding="none" className="p-2.5">
        conteúdo
      </Card>,
    );

    const card = screen.getByTestId("card");
    expect(card).toHaveClass("p-2.5");
    expect(card).not.toHaveClass("p-4");
    expect(card).not.toHaveClass("p-3");
  });
});
