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

// Ambient footage: no clip by default (as shipped with an empty manifest); tests opt in per scene.
const ambient = vi.hoisted(() => ({
  clips: {} as Record<string, { mp4: string; poster: string; hash: string }>,
  allowed: false,
}));
vi.mock("@/ui/ambient/scenes", () => ({
  AMBIENT_VIDEO_ENABLED: true,
  ambientClip: (scene: string) => ambient.clips[scene] ?? null,
}));
vi.mock("@/shared/lib/useAmbientAllowed", () => ({ useAmbientAllowed: () => ambient.allowed }));

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
  ambient.clips = {};
  ambient.allowed = false;
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

  it("uses the snow photo for ski trips and the photo of the destination otherwise, never an illustration first", () => {
    const { container, unmount } = setup(makeTrip({ type: "ski", destination_label: "Mar del Plata" }));
    expect(container.querySelector(".trip-hero-media img")).toHaveAttribute("data-photo", expect.stringMatching(/^snow-/));
    expect(container.querySelector(".trip-hero-media svg.trip-cover-art")).toBeNull();
    unmount();

    const generic = setup(makeTrip({ type: "generic", destination_label: "Mendoza" }));
    expect(generic.container.querySelector(".trip-hero-media img")).toHaveAttribute("data-photo", "vineyard");
  });

  it("loads the scene photo eagerly and at high priority, as the first thing on screen, with an empty alt", () => {
    const { container } = setup(makeTrip({ destination_label: "Lago Puelo" }));

    const photo = container.querySelector(".trip-hero-media img.trip-hero-photo")!;
    expect(photo).toHaveAttribute("data-photo", "lake-patagonia");
    expect(photo).toHaveAttribute("loading", "eager");
    expect(photo).toHaveAttribute("fetchpriority", "high");
    expect(photo).toHaveAttribute("alt", "");
    expect(photo).toHaveAttribute("srcset");
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

  it("gives the hero illustration the live class when the scene photo cannot load", () => {
    const { container } = setup(makeTrip({ has_cover: false }));

    fireEvent.error(container.querySelector(".trip-hero-media img")!);

    expect(container.querySelector(".trip-hero-media > svg.trip-cover-art")).toHaveClass("trip-cover-art-live");
  });

  it("makes no cover request when the trip has no cover: the scene photo shows instead", () => {
    const { container } = setup(makeTrip({ has_cover: false }));

    const sources = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatch(/^\/photos\//);
    expect(sources[0]).not.toContain("/cover");
    expect(container.querySelector("svg.trip-cover-art")).toBeNull();
  });

  it("falls back from the cover to the scene photo and then to the illustration, in the same media frame (offline)", () => {
    const { container } = setup(makeTrip({ has_cover: true, cover_version: 1 }));
    const frame = container.querySelector(".trip-hero-media")!;

    fireEvent.error(screen.getByRole("img", { name: /Foto de/ }));
    expect(screen.queryByRole("img", { name: /Foto de/ })).not.toBeInTheDocument();
    const photo = frame.querySelector("img")!;
    expect(photo.getAttribute("src")).toMatch(/^\/photos\//);

    fireEvent.error(photo);
    expect(frame.querySelector("img")).toBeNull();
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

describe("TripHero ambient layer", () => {
  // makeTrip() is "Bariloche 2027": snow, one of the kinds whose generic footage fits.
  const withClip = (scene = "snow") => {
    ambient.clips = {
      [scene]: { mp4: `/ambient/${scene}.0123456789.mp4`, poster: `/ambient/${scene}.0123456789.webp`, hash: "0123456789" },
    };
    return scene;
  };

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  it("shows only the photo when the scene has no clip", () => {
    const { container } = setup();

    expect(container.querySelector(".ambient-media")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector(".trip-hero-media img.trip-hero-photo")).toBeInTheDocument();
  });

  it("shows the photo, and no video or second still, when motion is not allowed", () => {
    withClip();
    ambient.allowed = false;
    const { container } = setup();

    expect(container.querySelector(".trip-hero-media img.trip-hero-photo")).toBeInTheDocument();
    expect(container.querySelector("img.ambient-poster")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("plays the clip over the photo when motion is allowed", () => {
    const scene = withClip();
    ambient.allowed = true;
    const { container } = setup();

    const video = container.querySelector("video.ambient-video")!;
    expect(video).toHaveAttribute("src", `/ambient/${scene}.0123456789.mp4`);
    expect(video.closest(".ambient-media")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".trip-hero-media img.trip-hero-photo")).toBeInTheDocument();
  });

  it("never plays the Sydney city loop: a city trip shows its photo even when a city clip exists", () => {
    withClip("city");
    ambient.allowed = true;
    const { container } = setup(makeTrip({ destination_label: "Buenos Aires", name: "Finde" }));

    expect(container.querySelector(".trip-hero-media img")).toHaveAttribute("data-photo", expect.stringMatching(/^city-/));
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector(".ambient-media")).toBeNull();
  });

  it("layers photo, then footage, then the cover control as direct children of the media frame", () => {
    withClip();
    ambient.allowed = true;
    const { container } = setup();

    const frame = container.querySelector(".trip-hero-media")!;
    const children = [...frame.children].map((child) => (child.tagName === "IMG" ? "img" : child.className.trim()));
    expect(children).toEqual(["img", "ambient-media", "trip-hero-media-action"]);
  });

  it("lets the cover photo replace the scene photo and the footage", () => {
    const trip = makeTrip({ has_cover: true, cover_version: 2 });
    withClip();
    ambient.allowed = true;
    const { container } = setup(trip);

    const photos = container.querySelectorAll("img.trip-hero-photo");
    expect(photos).toHaveLength(1);
    expect(photos[0]).toHaveAttribute("src", `/api/trips/${TRIP_ID}/cover?v=2`);
    expect(container.querySelector(".ambient-media")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("falls through to the scene photo and footage when the cover photo cannot load", () => {
    const trip = makeTrip({ has_cover: true, cover_version: 2 });
    withClip();
    ambient.allowed = true;
    const { container } = setup(trip);

    fireEvent.error(screen.getByRole("img", { name: /Foto de/ }));

    expect(container.querySelector("video.ambient-video")).toBeInTheDocument();
    expect(container.querySelector("img.trip-hero-photo")!.getAttribute("src")).toMatch(/^\/photos\//);
  });

  it("keeps the hero box when footage is added or removed", () => {
    const trip = makeTrip();
    const without = setup(trip);
    const frame = without.container.querySelector(".trip-hero-media")!;
    expect(frame.classList.contains("trip-hero-media")).toBe(true);
    without.unmount();

    withClip();
    const withFootage = setup(trip);

    expect(withFootage.container.querySelector(".trip-hero-media")?.className).toBe(frame.className);
  });
});
