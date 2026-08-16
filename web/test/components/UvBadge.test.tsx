import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UvBadge } from "../../src/components/UvBadge";

describe("UvBadge", () => {
  it.each([
    [0, "Baixo"],
    [2, "Baixo"],
    [2.4, "Baixo"],
    [2.6, "Moderado"],
    [3, "Moderado"],
    [5, "Moderado"],
    [5.3, "Moderado"],
    [6, "Alto"],
    [7, "Alto"],
    [8, "Muito alto"],
    [10, "Muito alto"],
    [11, "Extremo"],
    [15, "Extremo"],
  ])(
    "valor %s classifica como '%s' (escala OMS, arredondado ao inteiro mais próximo)",
    (value, label) => {
      render(<UvBadge value={value} />);
      expect(screen.getByTestId("uv-badge")).toHaveTextContent(label);
    },
  );

  it("valor negativo (não deveria ocorrer, mas é hardware real) não quebra — cai em 'Baixo'", () => {
    render(<UvBadge value={-1} />);
    expect(screen.getByTestId("uv-badge")).toHaveTextContent("Baixo");
  });

  it("cada nível usa uma classe de cor distinta", () => {
    const { rerender } = render(<UvBadge value={1} />);
    expect(screen.getByTestId("uv-badge")).toHaveClass("text-uv-low");

    rerender(<UvBadge value={11} />);
    expect(screen.getByTestId("uv-badge")).toHaveClass("text-uv-extreme");
  });
});
