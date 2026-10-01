import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { TripProvider } from "../TripProvider";
import { makeTrip } from "../fixtures";
import { ComingSoon } from "./ComingSoon";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

function setup(moduleKey: string, modules: string[]) {
  return renderWithProviders(
    <TripProvider trip={makeTrip({ modules })}>
      <ComingSoon moduleKey={moduleKey} />
    </TripProvider>,
  );
}

describe("ComingSoon", () => {
  it("shows the placeholder with the module label", () => {
    setup("budget", ["budget"]);

    expect(screen.getByText(messages.trips.comingSoon.title)).toBeInTheDocument();
    expect(
      screen.getByText(messages.trips.comingSoon.description.replace("{section}", messages.trips.sections.budget)),
    ).toBeInTheDocument();
  });

  it("uses the raw key for modules without copy", () => {
    setup("mystery", ["mystery"]);

    expect(
      screen.getByText(messages.trips.comingSoon.description.replace("{section}", "mystery")),
    ).toBeInTheDocument();
  });

  it("is a 404 for a section the trip type does not have", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => setup("ski", ["budget"])).toThrow("NOT_FOUND");

    spy.mockRestore();
  });
});
