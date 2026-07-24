import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryProvider } from "../../src/providers/QueryProvider";

describe("QueryProvider", () => {
  it("renderiza os filhos normalmente (só injeta o QueryClient no contexto)", () => {
    render(
      <QueryProvider>
        <p>conteúdo filho</p>
      </QueryProvider>,
    );

    expect(screen.getByText("conteúdo filho")).toBeInTheDocument();
  });
});
