import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { placeCard } from "../lib/placement";
import { TourOverlay } from "./TourOverlay";

const labels = { skip: "Saltar", back: "Anterior", next: "Siguiente", done: "Listo" };

function setup(overrides: Partial<Parameters<typeof TourOverlay>[0]> = {}) {
  const handlers = { onNext: vi.fn(), onBack: vi.fn(), onSkip: vi.fn() };
  const view = render(
    <TourOverlay
      open
      rect={{ x: 40, y: 100, width: 200, height: 60 }}
      stepKey="nav"
      progress="Paso 1 de 4"
      title="Las secciones"
      body="Desde acá saltás a todo."
      labels={labels}
      isFirst
      isLast={false}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...view, ...handlers };
}

describe("TourOverlay", () => {
  it("is an open modal dialog named by the step title and described by its body", () => {
    setup();

    const dialog = screen.getByRole("dialog", { name: "Las secciones" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAccessibleDescription("Desde acá saltás a todo.");
  });

  it("states the progress as text", () => {
    setup({ progress: "Paso 2 de 4" });

    expect(screen.getByText("Paso 2 de 4")).toBeInTheDocument();
  });

  it("puts focus on the primary control", () => {
    setup();

    expect(screen.getByRole("button", { name: "Siguiente" })).toHaveFocus();
  });

  it("has no Back on the first step and offers it afterwards", () => {
    const { rerender, onBack } = setup();
    expect(screen.queryByRole("button", { name: "Anterior" })).not.toBeInTheDocument();

    rerender(
      <TourOverlay
        open rect={null} stepKey="cover" progress="Paso 2 de 4" title="t" body="b" labels={labels}
        isFirst={false} isLast={false} onNext={vi.fn()} onBack={onBack} onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("reads Listo on the last step", () => {
    setup({ isLast: true });

    expect(screen.getByRole("button", { name: "Listo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument();
  });

  it("wires Next and Skip", () => {
    const { onNext, onSkip } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }));

    expect(onNext).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("treats Escape (the native cancel) as a skip and keeps the dialog for the owner to close", () => {
    const { onSkip } = setup();
    const dialog = screen.getByRole("dialog");

    const notPrevented = fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(onSkip).toHaveBeenCalledOnce();
    expect(notPrevented).toBe(false); // preventDefault was called
    expect(dialog).toHaveAttribute("open");
  });

  it("does not dismiss on a click on the dim around the card", () => {
    const { onSkip } = setup();

    fireEvent.click(screen.getByRole("dialog"));

    expect(onSkip).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("hides the ring from assistive tech and shows none without a rect", () => {
    const { container, rerender } = setup();
    const ring = container.querySelector(".tour-spotlight");
    expect(ring).toHaveAttribute("aria-hidden", "true");
    expect(ring).not.toHaveAttribute("data-empty");
    expect((ring as HTMLElement).style.getPropertyValue("--spot-w")).toBe("212px");

    rerender(
      <TourOverlay
        open rect={null} stepKey="nav" progress="p" title="t" body="b" labels={labels}
        isFirst isLast={false} onNext={vi.fn()} onBack={vi.fn()} onSkip={vi.fn()}
      />,
    );
    expect(container.querySelector(".tour-spotlight")).toHaveAttribute("data-empty");
  });

  it("places the card with placeCard from its measured size and the viewport", () => {
    const sizes = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(288);
    const heights = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(180);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    const rect = { x: 40, y: 100, width: 200, height: 60 };

    const { container } = setup({ rect });

    const card = container.querySelector<HTMLElement>(".tour-card")!;
    const expected = placeCard(rect, { width: 390, height: 844 }, { width: 288, height: 180 });
    expect(card.style.getPropertyValue("--card-x")).toBe(`${expected.x}px`);
    expect(card.style.getPropertyValue("--card-y")).toBe(`${expected.y}px`);
    expect(card.dataset.side).toBe(expected.side);
    sizes.mockRestore();
    heights.mockRestore();
  });

  it("closes the dialog when it is told it is no longer open", () => {
    const { rerender } = setup();

    rerender(
      <TourOverlay
        open={false} rect={null} stepKey="nav" progress="p" title="t" body="b" labels={labels}
        isFirst isLast={false} onNext={vi.fn()} onBack={vi.fn()} onSkip={vi.fn()}
      />,
    );

    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
  });
});
