import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { ComingSoon } from "./ComingSoon";

describe("ComingSoon", () => {
  it("shows the placeholder with the module label", () => {
    renderWithProviders(<ComingSoon moduleKey="budget" />);

    expect(screen.getByText(messages.trips.comingSoon.title)).toBeInTheDocument();
    expect(
      screen.getByText(messages.trips.comingSoon.description.replace("{section}", messages.trips.sections.budget)),
    ).toBeInTheDocument();
  });

  it("uses the raw key for unknown modules", () => {
    renderWithProviders(<ComingSoon moduleKey="mystery" />);

    expect(
      screen.getByText(messages.trips.comingSoon.description.replace("{section}", "mystery")),
    ).toBeInTheDocument();
  });
});
