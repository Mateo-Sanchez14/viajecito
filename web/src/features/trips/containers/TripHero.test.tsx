import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { CREW_ID, TRIP_ID, formatDay, makeMe, makeTrip } from "../fixtures";
import { TripProvider } from "../TripProvider";
import { TripHero } from "./TripHero";

const clock = vi.hoisted(() => ({ now: null as Date | null }));
vi.mock("@/shared/lib/useClientNow", () => ({ useClientNow: () => clock.now }));

const t = messages.trips.hero.countdown;
// Noon in Buenos Aires.
const at = (iso: string) => new Date(`${iso}T15:00:00Z`);

function setup(trip = makeTrip()) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>
        <TripHero />
      </TripProvider>
    </MeProvider>,
  );
}

beforeEach(() => {
  clock.now = at("2027-06-21");
});

describe("TripHero countdown", () => {
  it("shows the day count, with the plural unit and caption, for a trip 10 days away", () => {
    setup(); // starts 2027-07-01

    expect(screen.getByText("10")).toHaveClass("ui-tabular");
    expect(screen.getByText("días")).toBeInTheDocument();
    expect(screen.getByText(t.upcomingCaption)).toBeInTheDocument();
  });

  it("says tomorrow instead of '1 días'", () => {
    clock.now = at("2027-06-30");
    setup();

    expect(screen.getByText(t.tomorrow)).toBeInTheDocument();
    expect(screen.getByText(t.tomorrowCaption)).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText(/1 d[ií]as/)).not.toBeInTheDocument();
  });

  it("says today on the start day", () => {
    clock.now = at("2027-07-01");
    setup();

    expect(screen.getByText(t.today)).toBeInTheDocument();
    expect(screen.getByText(t.todayCaption)).toBeInTheDocument();
  });

  it("shows the trip day while ongoing, inclusive of the last day", () => {
    clock.now = at("2027-07-08");
    setup();

    expect(screen.getByText("Día 8")).toBeInTheDocument();
    expect(screen.getByText("de 8")).toBeInTheDocument();
    expect(screen.getByText(t.ongoingCaption)).toBeInTheDocument();
  });

  it("shows finished after the end date, never a negative number", () => {
    clock.now = at("2027-07-20");
    const { container } = setup();

    expect(screen.getByText(t.done)).toBeInTheDocument();
    expect(container.querySelector(".trip-pass-figure")?.textContent).not.toMatch(/-\d/);
  });

  it("shows finished for a trip marked done, whatever its dates say", () => {
    setup(makeTrip({ status: "done" }));

    expect(screen.getByText(t.done)).toBeInTheDocument();
  });

  it("prompts to set the dates, linking to the dates module, and shows no number", () => {
    setup(makeTrip({ start_on: null, end_on: null }));

    expect(screen.getByText(t.undated)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.setDates })).toHaveAttribute(
      "href",
      `/crews/${CREW_ID}/trips/${TRIP_ID}/dates`,
    );
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("does not offer the dates link when the trip has no dates module", () => {
    setup(makeTrip({ start_on: null, end_on: null, modules: ["proposals"] }));

    expect(screen.getByText(t.undated)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a skeleton, not a number, before the client clock is known", () => {
    clock.now = null;
    const { container } = setup();

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(container.querySelector(".trip-pass-value")).toBeNull();
  });
});

describe("TripHero facts and media", () => {
  it("lists dates, destination and currency once each and adds no Resumen link", () => {
    setup();

    expect(
      screen.getAllByText(
        messages.trips.dateRange.replace("{start}", formatDay("2027-07-01")).replace("{end}", formatDay("2027-07-08")),
      ),
    ).toHaveLength(1);
    expect(screen.getAllByText("Bariloche")).toHaveLength(1);
    expect(screen.getAllByText("USD")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: messages.trips.modules.overview })).not.toBeInTheDocument();
  });

  it("falls back to the no-destination copy", () => {
    setup(makeTrip({ destination_label: "" }));

    expect(screen.getByText(messages.trips.overview.noDestination)).toBeInTheDocument();
  });

  it("uses the snow illustration for ski trips and a decorative svg otherwise", () => {
    const { container, unmount } = setup(makeTrip({ type: "ski" }));
    expect(container.querySelector("svg[data-scene='snow']")).toHaveAttribute("aria-hidden", "true");
    unmount();

    const generic = setup(makeTrip({ type: "generic" }));
    expect(generic.container.querySelector("svg.trip-cover-art")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("TripHero cover", () => {
  it("shows the cover photo from the versioned private endpoint, named after the trip", () => {
    const { container } = setup(makeTrip({ has_cover: true, cover_version: 7 }));

    const photo = screen.getByRole("img", { name: "Foto de Bariloche 2027" });
    expect(photo).toHaveAttribute("src", `/api/trips/${TRIP_ID}/cover?v=7`);
    expect(photo).toHaveClass("trip-hero-photo");
    expect(photo).toHaveAttribute("decoding", "async");
    expect(container.querySelector("svg.trip-cover-art")).toBeNull();
  });

  it("requests a new URL when the cover version changes", () => {
    const first = setup(makeTrip({ has_cover: true, cover_version: 1 }));
    const before = screen.getByRole("img", { name: /Foto de/ }).getAttribute("src");
    first.unmount();

    setup(makeTrip({ has_cover: true, cover_version: 2 }));

    expect(screen.getByRole("img", { name: /Foto de/ }).getAttribute("src")).not.toBe(before);
  });

  it("makes no cover request and shows the illustration when the trip has no cover", () => {
    const { container } = setup(makeTrip({ has_cover: false }));

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg.trip-cover-art")).toBeInTheDocument();
  });

  it("falls back to the illustration, in the same media frame, when the photo cannot load (offline)", () => {
    const { container } = setup(makeTrip({ has_cover: true, cover_version: 1 }));
    const frame = container.querySelector(".trip-hero-media")!;

    fireEvent.error(screen.getByRole("img", { name: /Foto de/ }));

    expect(screen.queryByRole("img", { name: /Foto de/ })).not.toBeInTheDocument();
    expect(frame.querySelector("svg.trip-cover-art")).toBeInTheDocument();
    expect(container.querySelector(".trip-hero-media")).toBe(frame);
  });

  it("puts the cover control in the media corner", () => {
    const { container } = setup();

    const action = container.querySelector(".trip-hero-media > .trip-hero-media-action");
    expect(action).toContainElement(screen.getByRole("button", { name: messages.trips.cover.add }));
  });

  it("offers to change the photo when there is one", () => {
    setup(makeTrip({ has_cover: true, cover_version: 1 }));

    expect(screen.getByRole("button", { name: messages.trips.cover.change })).toBeInTheDocument();
  });
});
