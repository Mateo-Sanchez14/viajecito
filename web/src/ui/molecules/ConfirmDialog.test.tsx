import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function setup(open = true) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open={open}
      title="Sure?"
      description="No se puede deshacer"
      confirmLabel="Borrar"
      cancelLabel="Dejar"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("shows title, description and both actions when open", () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Sure?" })).toBeInTheDocument();
    expect(screen.getByText("No se puede deshacer")).toBeInTheDocument();
  });

  it("calls onConfirm when confirming", () => {
    const { onConfirm, onCancel } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when cancelling", () => {
    const { onConfirm, onCancel } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Dejar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("treats the native cancel event (Escape) as cancelling", () => {
    const { onCancel } = setup();

    screen.getByRole("dialog", { hidden: true }).dispatchEvent(new Event("cancel", { cancelable: true }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the cancel button when opened", () => {
    setup();

    expect(screen.getByRole("button", { name: "Dejar" })).toHaveFocus();
  });

  it("is not shown while closed", () => {
    setup(false);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
