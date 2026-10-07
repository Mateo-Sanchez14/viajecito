import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

function setup(open = true) {
  const onClose = vi.fn();
  render(
    <Sheet open={open} onClose={onClose} title="Agregar al viaje" closeLabel="Cerrar" description="Elegí qué sumar">
      <a href="/x">Primer link</a>
      <button type="button">Otro</button>
    </Sheet>,
  );
  return { onClose };
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Hoja" closeLabel="Cerrar">
        <button type="button">Adentro</button>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("is a labelled dialog with its content when open", () => {
    setup();

    const dialog = screen.getByRole("dialog", { name: "Agregar al viaje" });
    expect(dialog).toHaveAccessibleDescription("Elegí qué sumar");
    expect(screen.getByRole("link", { name: "Primer link" })).toBeInTheDocument();
  });

  it("renders nothing visible and no content while closed", () => {
    setup(false);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Primer link" })).not.toBeInTheDocument();
  });

  it("focuses the first control of the content when it opens", () => {
    setup();

    expect(screen.getByRole("link", { name: "Primer link" })).toHaveFocus();
  });

  it("closes from the labelled close button", () => {
    const { onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("treats the native cancel event (Escape) as closing and keeps the dialog controlled", () => {
    const { onClose } = setup();
    const cancel = new Event("cancel", { cancelable: true });

    screen.getByRole("dialog").dispatchEvent(cancel);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancel.defaultPrevented).toBe(true);
  });

  it("closes on a backdrop click but not on a click inside the panel", () => {
    const { onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Otro" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the opener when it closes", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    opener.focus();

    fireEvent.click(opener);
    expect(screen.getByRole("button", { name: "Adentro" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("returns focus to the opener after Escape", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    opener.focus();
    fireEvent.click(opener);

    act(() => {
      screen.getByRole("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
    });

    expect(opener).toHaveFocus();
  });
});
