import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import type { ProposalStatus } from "../api/proposals";
import { StatusControl } from "./StatusControl";

const t = messages.proposals;

function setup(status: ProposalStatus, allowed: ProposalStatus[], pending = false) {
  const onTransition = vi.fn();
  renderWithProviders(
    <StatusControl status={status} allowedTransitions={allowed} onTransition={onTransition} pending={pending} />,
  );
  return { onTransition };
}

const buttons = () =>
  within(screen.getByRole("group", { name: t.transition.label }))
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("StatusControl", () => {
  it("renders only the allowed transitions", () => {
    setup("proposed", ["discussing", "chosen", "discarded"]);

    expect(buttons()).toEqual([t.transition.discussing, t.transition.chosen, t.transition.discarded]);
    expect(screen.queryByRole("button", { name: t.transition.booked })).not.toBeInTheDocument();
  });

  it("uses reopen and unbook copy for the backwards edges", () => {
    setup("booked", ["chosen", "discarded"]);

    expect(buttons()).toEqual([t.transition.unbook, t.transition.discarded]);
  });

  it("renders nothing when there is nowhere to go", () => {
    const { container } = renderWithProviders(
      <StatusControl status="proposed" allowedTransitions={[]} onTransition={() => {}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("applies a forward transition straight away", () => {
    const { onTransition } = setup("proposed", ["discussing", "chosen", "discarded"]);

    fireEvent.click(screen.getByRole("button", { name: t.transition.chosen }));

    expect(onTransition).toHaveBeenCalledWith("chosen");
  });

  it("asks for confirmation before discarding, and only sends it once confirmed", () => {
    const { onTransition } = setup("proposed", ["chosen", "discarded"]);

    fireEvent.click(screen.getByRole("button", { name: t.transition.discarded }));

    const dialog = screen.getByRole("dialog", { name: t.transition.confirmDiscard });
    expect(onTransition).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: t.transition.confirm }));
    expect(onTransition).toHaveBeenCalledExactlyOnceWith("discarded");
  });

  it("does nothing when the confirmation is cancelled", () => {
    const { onTransition } = setup("proposed", ["chosen", "discarded"]);

    fireEvent.click(screen.getByRole("button", { name: t.transition.discarded }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: t.transition.confirmDiscard })).getByRole("button", {
        name: t.transition.cancel,
      }),
    );

    expect(onTransition).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms backwards moves too, naming both states", () => {
    const { onTransition } = setup("chosen", ["booked", "discussing", "discarded"]);

    fireEvent.click(screen.getByRole("button", { name: t.transition.reopen }));

    const dialog = screen.getByRole("dialog", { name: t.transition.confirmBackwards });
    expect(dialog).toHaveAccessibleDescription(
      t.transition.confirmBackwardsBody.replace("{from}", t.status.chosen).replace("{to}", t.status.discussing),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: t.transition.confirm }));
    expect(onTransition).toHaveBeenCalledWith("discussing");
  });

  it("does not ask for confirmation to reopen a discarded proposal", () => {
    const { onTransition } = setup("discarded", ["proposed"]);

    fireEvent.click(screen.getByRole("button", { name: t.transition.proposed }));

    expect(onTransition).toHaveBeenCalledWith("proposed");
  });

  it("disables every transition while one is being saved, with 44px targets", () => {
    setup("proposed", ["discussing", "chosen"], true);

    for (const button of within(screen.getByRole("group", { name: t.transition.label })).getAllByRole("button")) {
      expect(button).toBeDisabled();
      expect(button.className).toContain("min-h-11");
    }
  });
});
