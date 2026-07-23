import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../src/App";

describe("App", () => {
  it("renderiza sem lançar erro e mostra o título da Estação Meteorológica", () => {
    render(<App />);

    expect(screen.getByText(/estação meteorológica/i)).toBeInTheDocument();
  });
});
