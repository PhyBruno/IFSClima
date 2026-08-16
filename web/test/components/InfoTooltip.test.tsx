import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InfoTooltip } from "../../src/components/InfoTooltip";

/**
 * `InfoTooltip` — correção (feedback do usuário, 2026-08-16): "ao passar o
 * mouse por cima do tooltip [do UV], o texto expande pra cima e fica
 * ilegível" + "verifique a responsividade mobile". Os testes abaixo cobrem
 * as duas causas (ver docstring do componente):
 *
 * 1. Perto do TOPO da viewport (onde os cards de Umidade/UV realmente
 *    vivem, logo abaixo do header): o balão deve abrir pra BAIXO, nunca
 *    cortado na borda superior da janela.
 * 2. Perto da BORDA horizontal da viewport (cenário mobile, grid 2
 *    colunas): o balão deve ficar inteiro dentro da tela, nunca vazando.
 *
 * `getBoundingClientRect`/`window.innerWidth`/`innerHeight` são mockados
 * por teste (o jsdom não faz layout de verdade — sem mock, tudo é 0) para
 * simular cada cenário de posição na tela.
 */
function mockButtonRect(rect: Partial<DOMRect>) {
  const fullRect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON() {
      return this;
    },
    ...rect,
  };
  return vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue(fullRect);
}

function mockViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

const ORIGINAL_INNER_WIDTH = window.innerWidth;
const ORIGINAL_INNER_HEIGHT = window.innerHeight;

afterEach(() => {
  vi.restoreAllMocks();
  mockViewport(ORIGINAL_INNER_WIDTH, ORIGINAL_INNER_HEIGHT);
});

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

  describe("posicionamento (correção, feedback do usuário, 2026-08-16)", () => {
    it("botão perto do TOPO da viewport (cenário real: cards de Umidade/UV logo abaixo do header) abre pra BAIXO, nunca cortado no topo da janela", () => {
      mockViewport(1440, 900);
      mockButtonRect({ top: 20, bottom: 34, left: 700, right: 714, width: 14, height: 14 });

      render(<InfoTooltip label="Como X é calculado">Explicação de X.</InfoTooltip>);
      fireEvent.mouseEnter(screen.getByRole("button", { name: "Como X é calculado" }));

      const tooltip = screen.getByRole("tooltip");
      // top >= 0 (nunca um valor negativo, que cortaria o balão no topo da janela).
      expect(Number(tooltip.style.top.replace("px", ""))).toBeGreaterThanOrEqual(34);
      // Sem translateY(-100%): o balão cresce PRA BAIXO a partir de `top`, não pra cima.
      expect(tooltip.style.transform).toBe("");
    });

    it("botão perto da BASE da viewport, sem espaço embaixo, abre pra CIMA", () => {
      mockViewport(1440, 900);
      mockButtonRect({ top: 870, bottom: 884, left: 700, right: 714, width: 14, height: 14 });

      render(<InfoTooltip label="Como X é calculado">Explicação de X.</InfoTooltip>);
      fireEvent.mouseEnter(screen.getByRole("button", { name: "Como X é calculado" }));

      const tooltip = screen.getByRole("tooltip");
      expect(tooltip.style.transform).toBe("translateY(-100%)");
    });

    it("mobile: card na coluna da DIREITA (perto da borda direita da tela) não deixa o balão vazar — fica inteiro dentro da viewport", () => {
      mockViewport(375, 800); // iPhone SE/mini-ish.
      // Ícone perto da borda direita de uma tela de 375px (ex. card "Umidade" na coluna direita do grid 2 colunas).
      mockButtonRect({ top: 120, bottom: 134, left: 340, right: 354, width: 14, height: 14 });

      render(<InfoTooltip label="Como X é calculado">Explicação de X.</InfoTooltip>);
      fireEvent.mouseEnter(screen.getByRole("button", { name: "Como X é calculado" }));

      const tooltip = screen.getByRole("tooltip");
      const left = Number(tooltip.style.left.replace("px", ""));
      const width = Number(tooltip.style.width.replace("px", ""));
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + width).toBeLessThanOrEqual(375);
    });

    it("mobile: card na coluna da ESQUERDA (perto da borda esquerda da tela) também não deixa o balão vazar", () => {
      mockViewport(375, 800);
      mockButtonRect({ top: 120, bottom: 134, left: 8, right: 22, width: 14, height: 14 });

      render(<InfoTooltip label="Como X é calculado">Explicação de X.</InfoTooltip>);
      fireEvent.mouseEnter(screen.getByRole("button", { name: "Como X é calculado" }));

      const tooltip = screen.getByRole("tooltip");
      const left = Number(tooltip.style.left.replace("px", ""));
      expect(left).toBeGreaterThanOrEqual(0);
    });

    it("recalcula a posição a cada nova abertura (não fica preso na primeira medição)", () => {
      mockViewport(1440, 900);
      const rectSpy = mockButtonRect({
        top: 20,
        bottom: 34,
        left: 700,
        right: 714,
        width: 14,
        height: 14,
      });

      render(<InfoTooltip label="Como X é calculado">Explicação de X.</InfoTooltip>);
      const button = screen.getByRole("button", { name: "Como X é calculado" });

      fireEvent.mouseEnter(button);
      expect(screen.getByRole("tooltip").style.transform).toBe("");
      fireEvent.mouseLeave(button);

      rectSpy.mockReturnValue({
        x: 0,
        y: 0,
        top: 870,
        bottom: 884,
        left: 700,
        right: 714,
        width: 14,
        height: 14,
        toJSON() {
          return this;
        },
      } as DOMRect);

      fireEvent.mouseEnter(button);
      expect(screen.getByRole("tooltip").style.transform).toBe("translateY(-100%)");
    });
  });
});
