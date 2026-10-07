import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NextActionRow } from "./NextActionRow";

const icon = <svg data-testid="icon" aria-hidden="true" />;

describe("NextActionRow", () => {
  it("renders the title, the detail and a decorative icon", () => {
    render(<NextActionRow icon={icon} title="Subí los documentos" detail="Pasajes y seguro" />);

    expect(screen.getByText("Subí los documentos")).toBeInTheDocument();
    expect(screen.getByText("Pasajes y seguro")).toBeInTheDocument();
    expect(screen.getByTestId("icon").closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("is a plain block, not a link, without an href", () => {
    render(<NextActionRow icon={icon} title="Algo" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("is one link named by its text, with a caret, when it has an href", () => {
    render(<NextActionRow icon={icon} title="Armá el itinerario" detail="Sin planes todavía" href="/x/itinerary" />);

    const link = screen.getByRole("link", { name: "Armá el itinerario Sin planes todavía" });
    expect(link).toHaveAttribute("href", "/x/itinerary");
    expect(link.querySelector(".next-action-caret")).not.toBeNull();
  });

  it("carries its tone, accent by default", () => {
    const { container, rerender } = render(<NextActionRow icon={icon} title="Algo" />);
    expect(container.firstElementChild).toHaveAttribute("data-tone", "accent");

    rerender(<NextActionRow icon={icon} title="Algo" tone="warn" />);
    expect(container.firstElementChild).toHaveAttribute("data-tone", "warn");
  });
});
