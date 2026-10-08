import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { CREW_ID } from "../fixtures";
import { CreateTripSheet } from "./CreateTripSheet";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const t = messages.trips.create;

describe("CreateTripSheet", () => {
  it("mounts the form only while open, in a dialog named after the action", () => {
    const closed = renderWithProviders(<CreateTripSheet crewId={CREW_ID} open={false} onClose={() => {}} />);
    expect(screen.queryByLabelText(t.destination)).not.toBeInTheDocument();
    closed.unmount();

    renderWithProviders(<CreateTripSheet crewId={CREW_ID} open onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: t.title })).toContainElement(screen.getByLabelText(t.destination));
  });

  it("focuses the destination first and closes through the close button", () => {
    const onClose = vi.fn();
    renderWithProviders(<CreateTripSheet crewId={CREW_ID} open onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: t.title });
    expect(within(dialog).getByLabelText(t.destination)).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: t.close }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("names the crew only when asked to", () => {
    const { unmount } = renderWithProviders(<CreateTripSheet crewId={CREW_ID} open onClose={() => {}} />);
    expect(screen.queryByText(/^En /)).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<CreateTripSheet crewId={CREW_ID} crewName="Familia" open onClose={() => {}} />);
    expect(screen.getByText(t.forCrew.replace("{crew}", "Familia"))).toBeInTheDocument();
  });
});
