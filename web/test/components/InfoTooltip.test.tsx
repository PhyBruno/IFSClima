import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InfoTooltip } from "../../src/components/InfoTooltip";

/**
 * `InfoTooltip` sobre o `Tooltip` do Radix (shadcn/ui). O posicionamento com
 * colisão (não cortar no topo/bordas da viewport) agora é responsabilidade do
 * Radix — o jsdom não faz layout, então não há o que medir aqui. Os testes
 * cobrem o comportamento: abrir por hover/foco, ligação a11y e o clique
 * alternando (suporte a toque, que o Radix não oferece sozinho).
 *
 * O Radix renderiza o conteúdo num portal e duplica o texto num nó
 * visualmente oculto com `role="tooltip"` (para leitor de tela) — é esse que
 * `findByRole("tooltip")` encontra.
 */
const LABEL = "Como X é calculado";

// O jsdom não implementa `PointerEvent`: sem ele, `fireEvent.pointer*` cai num
// `Event` genérico sem `clientX`/`clientY`, e a área de tolerância do Radix
// (calculada a partir das coordenadas do ponteiro) quebra.
if (!window.PointerEvent) {
  class PointerEventStub extends MouseEvent {
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}

function renderTooltip() {
  render(<InfoTooltip label={LABEL}>Explicação de X.</InfoTooltip>);
  return screen.getByRole("button", { name: LABEL });
}

// Hover real do Radix: `pointermove` de mouse (toque é ignorado de propósito).
function hover(element: HTMLElement) {
  fireEvent.pointerMove(element, { pointerType: "mouse", clientX: 0, clientY: 0 });
}

// Sair do botão: o Radix mantém uma área de tolerância até o balão e só fecha
// quando o ponteiro se move para fora dela.
function unhover(element: HTMLElement) {
  fireEvent.pointerLeave(element, { pointerType: "mouse", clientX: 0, clientY: 0 });
  fireEvent.pointerMove(document.body, { pointerType: "mouse", clientX: 500, clientY: 500 });
}

describe("InfoTooltip", () => {
  it("tooltip começa fechado — só o botão 'i' é visível", () => {
    const button = renderTooltip();

    expect(button).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("abre no hover do mouse e fecha ao sair", async () => {
    const button = renderTooltip();

    hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Explicação de X.");

    unhover(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("abre no foco por teclado (não só hover de mouse) e fecha no blur", async () => {
    const button = renderTooltip();

    fireEvent.focus(button);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    fireEvent.blur(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("liga o botão ao tooltip via aria-describedby quando aberto", async () => {
    const button = renderTooltip();
    expect(button).not.toHaveAttribute("aria-describedby");

    fireEvent.focus(button);
    const tooltip = await screen.findByRole("tooltip");

    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("clique alterna abrir/fechar (toque no mobile, onde não há hover)", async () => {
    const button = renderTooltip();

    fireEvent.click(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Explicação de X.");

    fireEvent.click(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  // Regressão: num toque real o navegador dispara pointerdown → pointerup →
  // click. O Trigger do Radix fecha no pointerdown, então o click seguinte
  // reabria — o segundo toque nunca fechava o balão.
  it("segundo toque completo (pointerdown + pointerup + click) fecha o balão", async () => {
    const button = renderTooltip();
    const tap = () => {
      fireEvent.pointerDown(button, { pointerType: "touch" });
      fireEvent.pointerUp(button, { pointerType: "touch" });
      fireEvent.click(button);
    };

    tap();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Explicação de X.");

    tap();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
