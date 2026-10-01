import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { ComingSoon } from "./ComingSoon";

function setup(moduleKey: string) {
  return renderWithProviders(<ComingSoon moduleKey={moduleKey} />);
}

describe("ComingSoon", () => {
  it("shows the placeholder with the module label", () => {
    setup("budget");

    expect(screen.getByText(messages.trips.comingSoon.title)).toBeInTheDocument();
    expect(
      screen.getByText(messages.trips.comingSoon.description.replace("{section}", messages.trips.modules.budget)),
    ).toBeInTheDocument();
  });

  it("uses the raw key for modules without copy", () => {
    setup("mystery");

    expect(
      screen.getByText(messages.trips.comingSoon.description.replace("{section}", "mystery")),
    ).toBeInTheDocument();
  });
});
