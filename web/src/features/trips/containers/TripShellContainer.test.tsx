import { fireEvent, screen, within } from "@testing-library/react";
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

// jsdom ignores CSS, so the wide nav and the bottom nav are both in the DOM: always scope by landmark.
const wideNav = () => within(screen.getByRole("navigation", { name: messages.trips.nav.label }));
const bottomNav = () => within(screen.getByRole("navigation", { name: messages.trips.nav.mobileLabel }));

function setup(modules = ["proposals", "budget"], trip: Parameters<typeof makeTrip>[0] = {}) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip({ modules, ...trip })}>
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
      [messages.trips.modules.overview, base],
      [messages.trips.modules.proposals, `${base}/proposals`],
      [messages.trips.modules.budget, `${base}/budget`],
    ]);
  });

  it("highlights the overview on the trip root", () => {
    setup();

    expect(wideNav().getByRole("link", { name: messages.trips.modules.overview })).toHaveAttribute("aria-current", "page");
    expect(wideNav().getByRole("link", { name: messages.trips.modules.budget })).not.toHaveAttribute("aria-current");
  });

  it("highlights the current section, including its sub-pages", () => {
    pathname = `${base}/budget/expenses/new`;
    setup();

    expect(wideNav().getByRole("link", { name: messages.trips.modules.budget })).toHaveAttribute("aria-current", "page");
    expect(wideNav().getByRole("link", { name: messages.trips.modules.overview })).not.toHaveAttribute("aria-current");
  });

  it("falls back to the module key when there is no copy for it", () => {
    setup(["mystery"]);

    expect(wideNav().getByRole("link", { name: "mystery" })).toHaveAttribute("href", `${base}/mystery`);
  });

  it("names the two navigations differently", () => {
    setup();

    expect(messages.trips.nav.mobileLabel).not.toBe(messages.trips.nav.label);
    expect(screen.getAllByRole("navigation")).toHaveLength(2);
    expect(screen.getAllByRole("navigation", { name: messages.trips.nav.label })).toHaveLength(1);
  });

  describe("bottom navigation", () => {
    const everything = ["proposals", "dates", "logistics", "itinerary", "today", "budget", "documents"];

    it("shows overview, the planning favorites and a more button", () => {
      setup(everything);

      const links = bottomNav().getAllByRole("link").map((link) => link.textContent);
      expect(links).toEqual([
        messages.trips.modules.overview,
        messages.trips.modules.proposals,
        messages.trips.modules.logistics,
        messages.trips.modules.itinerary,
      ]);
      expect(bottomNav().getByRole("button", { name: messages.trips.nav.more })).toBeInTheDocument();
    });

    it("marks the current section in the bottom bar", () => {
      pathname = `${base}/proposals`;
      setup(everything);

      expect(bottomNav().getByRole("link", { name: messages.trips.modules.proposals })).toHaveAttribute("aria-current", "page");
      expect(bottomNav().getByRole("link", { name: messages.trips.modules.overview })).not.toHaveAttribute("aria-current");
    });

    it("lists the other sections in the more sheet, not the ones already in the bar", () => {
      setup(everything);

      fireEvent.click(bottomNav().getByRole("button", { name: messages.trips.nav.more }));

      const sheet = screen.getByRole("dialog", { name: messages.trips.nav.moreTitle });
      const labels = within(sheet).getAllByRole("link").map((link) => link.textContent);
      expect(labels).toEqual([
        messages.trips.modules.dates,
        messages.trips.modules.today,
        messages.trips.modules.budget,
        messages.trips.modules.documents,
      ]);
    });

    it("lists a plugin module such as ski in the sheet", () => {
      setup([...everything, "ski"], { type: "ski" });

      fireEvent.click(bottomNav().getByRole("button", { name: messages.trips.nav.more }));

      expect(
        within(screen.getByRole("dialog")).getByRole("link", { name: messages.trips.modules.ski }),
      ).toHaveAttribute("href", `${base}/ski`);
    });

    it("promotes today, itinerary and documents while the trip is ongoing", () => {
      setup(everything, { status: "ongoing" });

      const links = bottomNav().getAllByRole("link").map((link) => link.textContent);
      expect(links).toEqual([
        messages.trips.modules.overview,
        messages.trips.modules.today,
        messages.trips.modules.itinerary,
        messages.trips.modules.documents,
      ]);
    });

    it("shows the more button as active when the current section lives in the sheet", () => {
      pathname = `${base}/budget`;
      setup(everything);

      expect(bottomNav().getByRole("button", { name: messages.trips.nav.more })).toHaveAttribute("data-active", "true");
    });

    it("has no more button when every section fits in the bar", () => {
      setup(["proposals"]);

      expect(bottomNav().queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
