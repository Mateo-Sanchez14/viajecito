import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { TripProvider } from "../TripProvider";
import { CREW_ID, TRIP_ID, formatDay, makeMe, makeTrip } from "../fixtures";
import { TripShellContainer } from "./TripShellContainer";

let pathname = "";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const base = `/crews/${CREW_ID}/trips/${TRIP_ID}`;

function setup(modules = ["proposals", "budget"]) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip({ modules })}>
        <TripShellContainer>
          <p>contenido</p>
        </TripShellContainer>
      </TripProvider>
    </MeProvider>,
  );
}

describe("TripShellContainer", () => {
  beforeEach(() => {
    pathname = base;
  });

  it("shows the trip name, its dates and the children", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1, name: "Bariloche 2027" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(formatDay("2027-07-01")))).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("builds the nav from the modules, overview first, with translated labels", () => {
    setup();

    const nav = screen.getByRole("navigation", { name: messages.trips.nav.label });
    const links = Array.from(nav.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      [messages.trips.sections.overview, base],
      [messages.trips.sections.proposals, `${base}/proposals`],
      [messages.trips.sections.budget, `${base}/budget`],
    ]);
  });

  it("highlights the overview on the trip root", () => {
    setup();

    expect(screen.getByRole("link", { name: messages.trips.sections.overview })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: messages.trips.sections.budget })).not.toHaveAttribute("aria-current");
  });

  it("highlights the current section, including its sub-pages", () => {
    pathname = `${base}/budget/expenses/new`;
    setup();

    expect(screen.getByRole("link", { name: messages.trips.sections.budget })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: messages.trips.sections.overview })).not.toHaveAttribute("aria-current");
  });

  it("falls back to the module key when there is no copy for it", () => {
    setup(["mystery"]);

    expect(screen.getByRole("link", { name: "mystery" })).toHaveAttribute("href", `${base}/mystery`);
  });
});
