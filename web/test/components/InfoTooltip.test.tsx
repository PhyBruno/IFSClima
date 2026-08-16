import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InfoTooltip } from "../../src/components/InfoTooltip";

describe("InfoTooltip", () => {
  it("tooltip começa fechado — só o botão 'i' é visível", () => {
    render(<InfoTooltip label="Como X é calculado">Explicação de X.</InfoTooltip>);

    expect(screen.getByRole("button", { name: "Como X é calculado" })).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("abre no hover (mouseEnter) e fecha no mouseLeave", () => {
    render(<InfoTooltip label="Como X é calculado">Explicação de X.</InfoTooltip>);
    const button = screen.getByRole("button", { name: "Como X é calculado" });

    fireEvent.mouseEnter(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Explicação de X.");

    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("abre no foco por teclado (não só hover de mouse) e fecha no blur", () => {
    render(<InfoTooltip label="Como X é calculado">Explicação de X.</InfoTooltip>);
    const button = screen.getByRole("button", { name: "Como X é calculado" });

    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.blur(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("liga o botão ao tooltip via aria-describedby quando aberto", () => {
    render(<InfoTooltip label="Como X é calculado">Explicação de X.</InfoTooltip>);
    const button = screen.getByRole("button", { name: "Como X é calculado" });

    fireEvent.focus(button);
    const tooltip = screen.getByRole("tooltip");
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
  });
});
