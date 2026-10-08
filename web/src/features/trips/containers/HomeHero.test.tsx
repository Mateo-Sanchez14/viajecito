import { fireEvent, screen, within } from "@testing-library/react";
import { createOpenApiHttp } from "openapi-msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { CREW_ID, TRIP_ID, formatDay, makeMe, makeSummary } from "../fixtures";
import { tripCountdown } from "../lib/countdown";
import { HomeHero } from "./HomeHero";
import { TripList } from "./TripList";

const clock = vi.hoisted(() => ({ now: null as Date | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/shared/lib/useClientNow", () => ({ useClientNow: () => clock.now }));

// Ambient footage: no clip by default (an empty manifest); tests opt in per scene.
const ambient = vi.hoisted(() => ({
  clips: {} as Record<string, { mp4: string; poster: string; hash: string }>,
  allowed: false,
}));
vi.mock("@/ui/ambient/scenes", () => ({
  AMBIENT_VIDEO_ENABLED: true,
  ambientClip: (scene: string) => ambient.clips[scene] ?? null,
}));
vi.mock("@/shared/lib/useAmbientAllowed", () => ({ useAmbientAllowed: () => ambient.allowed }));

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const OTHER_CREW = "55555555-5555-4555-8555-555555555555";
const OTHER_TRIP = "66666666-6666-4666-8666-666666666666";
const hero = messages.home.hero;
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function trips(rows: Record<string, ReturnType<typeof makeSummary>[]>, calls?: string[]) {
  return http.get("/api/crews/{crew_id}/trips", ({ params, response }) => {
    calls?.push(params.crew_id);
    return response(200).json(rows[params.crew_id] ?? []);
  });
}

const crewOf = (id: string, name: string, defaultTripId: string | null = null) => ({
  id,
  name,
  role: "member" as const,
  gastito_group_url: null,
  default_trip_id: defaultTripId,
});

function setup(me = makeMe(), extra?: React.ReactNode) {
  return renderWithProviders(
    <MeProvider me={me}>
      <HomeHero />
      {extra}
    </MeProvider>,
  );
}

beforeEach(() => {
  // Noon in Buenos Aires.
  clock.now = new Date("2027-06-21T15:00:00Z");
  ambient.clips = {};
  ambient.allowed = false;
});

describe("HomeHero greeting", () => {
  it("greets by display name inside the single h1", async () => {
    server.use(trips({}));
    setup();

    expect(screen.getByRole("heading", { level: 1, name: messages.home.greeting.replace("{name}", "Mateo") })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText(messages.app.tagline)).toBeInTheDocument();
    await screen.findByText(hero.empty.title);
  });

  it("greets neutrally, and never shows the phone, when there is no display name", async () => {
    server.use(trips({}));
    const base = makeMe();
    const { container } = setup({ ...base, person: { ...base.person, display_name: "   " } });

    expect(screen.getByRole("heading", { level: 1, name: messages.home.greetingAnonymous })).toBeInTheDocument();
    await screen.findByText(hero.empty.title);
    expect(container.textContent).not.toContain(base.person.phone);
    expect(container.textContent).not.toContain("5491155551234");
  });
});

describe("HomeHero next trip", () => {
  it("shows a loading skeleton, not a lone spinner, while the trips load", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/crews/{crew_id}/trips", async ({ response }) => {
        await gate;
        return response(200).json([makeSummary()]);
      }),
    );
    const { container } = setup();

    try {
      const busy = container.querySelector("[aria-busy='true']")!;
      expect(busy).toHaveAttribute("aria-label", hero.loading);
      expect(busy.querySelector(".ui-skeleton")).toBeInTheDocument();
    } finally {
      release();
    }
    expect(await screen.findByRole("link", { name: new RegExp(hero.open) })).toBeInTheDocument();
  });

  it("shows the loading skeleton while the client clock is unknown", async () => {
    clock.now = null;
    server.use(trips({ [CREW_ID]: [makeSummary()] }));
    const { container } = setup();

    await vi.waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: new RegExp(hero.open) })).not.toBeInTheDocument();
  });

  it("features the next trip with name, destination, dates, countdown and a link to its overview", async () => {
    server.use(trips({ [CREW_ID]: [makeSummary()] }));
    setup();

    const cta = await screen.findByRole("link", { name: hero.open });
    expect(cta).toHaveAttribute("href", `/crews/${CREW_ID}/trips/${TRIP_ID}`);
    expect(screen.getByRole("heading", { level: 2, name: "Bariloche 2027" })).toBeInTheDocument();
    expect(screen.getAllByText("Bariloche")).toHaveLength(1);
    expect(
      screen.getAllByText(messages.trips.dateRange.replace("{start}", formatDay("2027-07-01")).replace("{end}", formatDay("2027-07-08"))),
    ).toHaveLength(1);
    expect(screen.getByText(hero.next)).toBeInTheDocument();
    const state = tripCountdown("2027-07-01", "2027-07-08", zone(), clock.now!);
    expect(state.kind).toBe("upcoming");
    expect(screen.getByText(String((state as { days: number }).days))).toHaveClass("ui-tabular");
    expect(screen.getByText(messages.trips.hero.countdown.upcomingCaption)).toBeInTheDocument();
  });

  it("picks the earliest trip across crews and links to its crew", async () => {
    server.use(
      trips({
        [CREW_ID]: [makeSummary({ start_on: "2027-09-10", end_on: "2027-09-12", name: "Lejos" })],
        [OTHER_CREW]: [makeSummary({ id: OTHER_TRIP, name: "Cerca", start_on: "2027-07-01", end_on: "2027-07-03" })],
      }),
    );
    setup(makeMe({ crews: [crewOf(CREW_ID, "Los Pibes"), crewOf(OTHER_CREW, "Familia")] }));

    expect(await screen.findByRole("heading", { level: 2, name: "Cerca" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: hero.open })).toHaveAttribute("href", `/crews/${OTHER_CREW}/trips/${OTHER_TRIP}`);
  });

  it("shows the illustrated empty state when no trip qualifies", async () => {
    server.use(trips({ [CREW_ID]: [makeSummary({ status: "done" }), makeSummary({ id: OTHER_TRIP, start_on: null, end_on: null })] }));
    const { container } = setup();

    expect(await screen.findByRole("heading", { level: 2, name: hero.empty.title })).toBeInTheDocument();
    expect(screen.getByText(hero.empty.body)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: hero.open })).not.toBeInTheDocument();
    expect(container.querySelector(".landing-hero-media svg.trip-cover-art")).toBeInTheDocument();
  });

  it("shows the neutral empty state for a person with no crews, without any request", () => {
    const calls: string[] = [];
    server.use(trips({}, calls));
    setup(makeMe({ crews: [] }));

    expect(screen.getByRole("heading", { level: 2, name: hero.empty.title })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("shows the cover photo with empty alt and no illustration when the featured trip has a cover", async () => {
    server.use(trips({ [CREW_ID]: [makeSummary({ has_cover: true, cover_version: 4 })] }));
    const { container } = setup();

    await screen.findByRole("link", { name: hero.open });
    const photo = container.querySelector(".landing-hero-media img.trip-hero-photo")!;
    expect(photo).toHaveAttribute("src", `/api/trips/${TRIP_ID}/cover?v=4`);
    expect(photo).toHaveAttribute("alt", "");
    expect(container.querySelector(".landing-hero-media svg")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("falls back from the cover to the scene photo, then to the illustration, in the same frame", async () => {
    server.use(trips({ [CREW_ID]: [makeSummary({ has_cover: true, cover_version: 1 })] }));
    const { container } = setup();
    await screen.findByRole("link", { name: hero.open });
    const frame = container.querySelector(".landing-hero-media")!;

    fireEvent.error(frame.querySelector("img")!);
    const photo = frame.querySelector("img")!;
    expect(photo.getAttribute("src")).toMatch(/^\/photos\//);

    fireEvent.error(photo);
    expect(frame.querySelector("img")).toBeNull();
    expect(frame.querySelector("svg.trip-cover-art-live")).toBeInTheDocument();
    expect(container.querySelector(".landing-hero-media")).toBe(frame);
  });
});

describe("HomeHero scene photo", () => {
  const trip = (destination_label: string) => makeSummary({ destination_label, name: "Viaje", has_cover: false });

  it("shows the photo of the trip's scene, eager and at high priority, with no illustration", async () => {
    server.use(trips({ [CREW_ID]: [trip("Lago Puelo")] }));
    const { container } = setup();

    await screen.findByRole("link", { name: hero.open });
    const photo = container.querySelector<HTMLImageElement>(".landing-hero-media img.trip-hero-photo")!;
    expect(photo).toHaveAttribute("data-photo", "lake-patagonia");
    expect(photo).toHaveAttribute("loading", "eager");
    expect(photo).toHaveAttribute("fetchpriority", "high");
    expect(photo).toHaveAttribute("alt", "");
    expect(photo).toHaveAttribute("srcset");
    expect(photo).toHaveAttribute("width");
    expect(container.querySelector(".landing-hero-media svg")).toBeNull();
  });

  it.each([
    ["Mendoza", "vineyard"],
    ["Salta", "desert"],
    ["Mar del Plata", "beach-"],
    ["Ruta 40", "road"],
  ])("gives %s its own photo (%s)", async (destination, id) => {
    server.use(trips({ [CREW_ID]: [trip(destination)] }));
    const { container } = setup();

    await screen.findByRole("link", { name: hero.open });
    expect(container.querySelector(".landing-hero-media img")!.getAttribute("data-photo")).toContain(id);
  });

  it("uses the Buenos Aires photos, never the city video, for a city trip", async () => {
    ambient.clips = { city: { mp4: "/ambient/city.0123456789.mp4", poster: "/ambient/city.0123456789.webp", hash: "0123456789" } };
    ambient.allowed = true;
    server.use(trips({ [CREW_ID]: [trip("Buenos Aires")] }));
    const { container } = setup();

    await screen.findByRole("link", { name: hero.open });
    expect(container.querySelector(".landing-hero-media img")!.getAttribute("data-photo")).toMatch(/^city-/);
    expect(container.querySelector(".ambient-media")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });
});

describe("HomeHero ambient layer", () => {
  const scene = "snow"; // makeSummary() is "Bariloche 2027": snow
  const withClip = () => {
    ambient.clips = {
      [scene]: { mp4: `/ambient/${scene}.0123456789.mp4`, poster: `/ambient/${scene}.0123456789.webp`, hash: "0123456789" },
    };
  };

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  it("plays the scene video over the photo, under the panel, when there is no cover and motion is allowed", async () => {
    withClip();
    ambient.allowed = true;
    server.use(trips({ [CREW_ID]: [makeSummary()] }));
    const { container } = setup();

    await screen.findByRole("link", { name: hero.open });
    const media = container.querySelector(".landing-hero-media")!;
    expect(media.querySelector("img.trip-hero-photo")).toBeInTheDocument();
    expect(media.querySelector("svg")).toBeNull();
    expect(media.querySelector(".ambient-media video.ambient-video")).toHaveAttribute("src", `/ambient/${scene}.0123456789.mp4`);
    // The photo is the still: the footage brings no poster of its own over it.
    expect(media.querySelector("img.ambient-poster")).toBeNull();
    expect(container.querySelector(".landing-hero-panel video")).toBeNull();
  });

  it("shows only the photo, with no video and no second still, under reduced motion or Save-Data", async () => {
    withClip();
    ambient.allowed = false;
    server.use(trips({ [CREW_ID]: [makeSummary()] }));
    const { container } = setup();

    await screen.findByRole("link", { name: hero.open });
    expect(container.querySelector(".landing-hero-media img.trip-hero-photo")).toBeInTheDocument();
    expect(container.querySelector("img.ambient-poster")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("shows only the photo when the scene has no clip", async () => {
    server.use(trips({ [CREW_ID]: [makeSummary()] }));
    const { container } = setup();

    await screen.findByRole("link", { name: hero.open });
    expect(container.querySelector(".ambient-media")).toBeNull();
    expect(container.querySelector(".landing-hero-media img.trip-hero-photo")).toBeInTheDocument();
  });

  it("falls back to the illustration with the footage's own still when the photo cannot load", async () => {
    withClip();
    ambient.allowed = false;
    server.use(trips({ [CREW_ID]: [makeSummary()] }));
    const { container } = setup();
    await screen.findByRole("link", { name: hero.open });

    fireEvent.error(container.querySelector(".landing-hero-media img.trip-hero-photo")!);

    expect(container.querySelector(".landing-hero-media svg.trip-cover-art-live")).toBeInTheDocument();
    expect(container.querySelector(".landing-hero-media img.ambient-poster")).toBeInTheDocument();
  });

  it("lets the cover photo win over the scene photo and footage", async () => {
    withClip();
    ambient.allowed = true;
    server.use(trips({ [CREW_ID]: [makeSummary({ has_cover: true, cover_version: 1 })] }));
    const { container } = setup();

    await screen.findByRole("link", { name: hero.open });
    const photos = container.querySelectorAll("img.trip-hero-photo");
    expect(photos).toHaveLength(1);
    expect(photos[0]).toHaveAttribute("src", `/api/trips/${TRIP_ID}/cover?v=1`);
    expect(container.querySelector(".ambient-media")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("keeps footage out of the empty and loading states", async () => {
    withClip();
    ambient.allowed = true;
    server.use(trips({}));
    const { container } = setup();

    expect(container.querySelector(".ambient-media")).toBeNull();
    await screen.findByRole("heading", { level: 2, name: hero.empty.title });
    expect(container.querySelector(".ambient-media")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });
});

describe("HomeHero errors", () => {
  it("shows an alert with a retry that re-issues the request and replaces the alert", async () => {
    let calls = 0;
    server.use(
      http.untyped.get(`${globalThis.location.origin}/api/crews/:crewId/trips`, () => {
        calls += 1;
        return calls === 1 ? new Response(null, { status: 500 }) : Response.json([makeSummary()]);
      }),
    );
    setup();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(messages.trips.list.error);
    fireEvent.click(screen.getByRole("button", { name: messages.ui.retry }));

    expect(await screen.findByRole("link", { name: hero.open })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

describe("HomeHero requests", () => {
  it("issues exactly one trips request per crew even with the trip list mounted beside it", async () => {
    const calls: string[] = [];
    server.use(
      trips(
        { [CREW_ID]: [makeSummary()], [OTHER_CREW]: [makeSummary({ id: OTHER_TRIP, name: "Mendoza", start_on: "2027-08-01", end_on: "2027-08-02" })] },
        calls,
      ),
    );
    setup(
      makeMe({ crews: [crewOf(CREW_ID, "Los Pibes"), crewOf(OTHER_CREW, "Familia")] }),
      <>
        <TripList crewId={CREW_ID} />
        <TripList crewId={OTHER_CREW} />
      </>,
    );

    await screen.findAllByRole("link", { name: /Mendoza/ });
    await screen.findByRole("link", { name: hero.open });

    expect(calls.sort()).toEqual([CREW_ID, OTHER_CREW].sort());
  });
});

describe("HomeHero create call to action", () => {
  const cta = () => screen.findByRole("button", { name: hero.empty.cta });

  it("opens the new-trip sheet from the empty state, with the destination first", async () => {
    server.use(trips({}));
    setup();

    fireEvent.click(await cta());

    const sheet = await screen.findByRole("dialog", { name: messages.trips.create.title });
    const first = within(sheet).getAllByRole("textbox")[0];
    expect(first).toHaveAccessibleName(messages.trips.create.destination);
    // One crew: the sheet does not need to say where the trip lands.
    expect(within(sheet).queryByText(/^En /)).not.toBeInTheDocument();
  });

  it("closes the sheet again without creating anything", async () => {
    server.use(trips({}));
    setup();
    fireEvent.click(await cta());
    const sheet = await screen.findByRole("dialog", { name: messages.trips.create.title });

    fireEvent.click(within(sheet).getByRole("button", { name: messages.trips.create.close }));

    expect(within(sheet).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("also offers it when trips exist but none has a date", async () => {
    server.use(trips({ [CREW_ID]: [makeSummary({ start_on: null, end_on: null, status: "idea" })] }));
    setup();

    expect(await cta()).toBeInTheDocument();
  });

  it("names the crew in the sheet when the person belongs to several", async () => {
    server.use(trips({}));
    setup(makeMe({ crews: [crewOf(CREW_ID, "Los Pibes"), crewOf(OTHER_CREW, "Familia")] }));

    fireEvent.click(await cta());

    expect(await screen.findByText(messages.trips.create.forCrew.replace("{crew}", "Los Pibes"))).toBeInTheDocument();
  });

  it("offers no create button when there is a trip to feature, or no crew to create it in", async () => {
    server.use(trips({ [CREW_ID]: [makeSummary()] }));
    setup();
    await screen.findByRole("link", { name: hero.open });
    expect(screen.queryByRole("button", { name: hero.empty.cta })).not.toBeInTheDocument();
  });

  it("offers no create button without a crew", () => {
    setup(makeMe({ crews: [] }));

    expect(screen.queryByRole("button", { name: hero.empty.cta })).not.toBeInTheDocument();
  });
});
