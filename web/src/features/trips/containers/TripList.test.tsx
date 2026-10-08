import { fireEvent, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { CREW_ID, TRIP_ID, formatDay, makeSummary } from "../fixtures";
import { TripList } from "./TripList";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const THIRD_ID = "66666666-6666-4666-8666-666666666666";

function trips(...rows: ReturnType<typeof makeSummary>[]) {
  return http.get("/api/crews/{crew_id}/trips", ({ response }) => response(200).json(rows));
}

/** Freezes only `Date`, so timers and the mocked network keep running. */
function today(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${iso}T15:00:00Z`));
}

afterEach(() => vi.useRealTimers());

describe("TripList states", () => {
  it("announces the pending request as a named status and removes it when trips arrive", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    server.use(
      http.get("/api/crews/{crew_id}/trips", async ({ response }) => {
        await pending;
        return response(200).json([makeSummary()]);
      }),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);

    try {
      const loading = screen.getByRole("status", { name: messages.trips.list.loading });
      expect(loading).toBeInTheDocument();
      release();
      await waitForElementToBeRemoved(loading);
      expect(await screen.findByRole("link", { name: /Bariloche 2027/ })).toBeInTheDocument();
    } finally {
      release();
    }
  });

  it("shows the empty state, illustrated, when the crew has no trips", async () => {
    server.use(trips());
    const { container } = renderWithProviders(<TripList crewId={CREW_ID} />);

    expect(await screen.findByText(messages.trips.list.empty)).toBeInTheDocument();
    expect(container.querySelector("svg[data-scene='map']")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows an error message when loading fails", async () => {
    server.use(
      http.get("/api/crews/{crew_id}/trips", ({ response }) =>
        response(404).json({ code: "not_found", message: "x" }),
      ),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);

    expect(await screen.findByText(messages.trips.list.error)).toBeInTheDocument();
  });

  it("offers a retry when the list cannot load, and recovers", async () => {
    let calls = 0;
    server.use(
      http.get("/api/crews/{crew_id}/trips", ({ response }) => {
        calls += 1;
        return calls === 1
          ? response(404).json({ code: "not_found", message: "x" })
          : response(200).json([makeSummary()]);
      }),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(messages.trips.list.error);
    fireEvent.click(screen.getByRole("button", { name: messages.ui.retry }));
    expect(await screen.findByRole("link", { name: /Bariloche 2027/ })).toBeInTheDocument();
  });
});

describe("TripList cards", () => {
  it("draws each trip as a card link with destination, dates, people and status", async () => {
    server.use(trips(makeSummary()));
    renderWithProviders(<TripList crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: /Bariloche 2027/ });
    expect(link).toHaveAttribute("href", `/crews/${CREW_ID}/trips/${TRIP_ID}`);
    expect(link).toHaveClass("trip-card");
    expect(link).toHaveTextContent("Bariloche");
    expect(link).toHaveTextContent(
      messages.trips.dateRange.replace("{start}", formatDay("2027-07-01")).replace("{end}", formatDay("2027-07-08")),
    );
    expect(link).toHaveTextContent(messages.trips.status.planning);
    expect(link).toHaveTextContent("2 personas");
    // Avatars are decorative: the count in words carries the meaning.
    expect(link.querySelector(".avatar-stack-faces")).toHaveAttribute("aria-hidden", "true");
    expect(link.querySelectorAll(".avatar-stack-face")).toHaveLength(2);
  });

  it("adds a +N bubble when the group is larger than the preview, and says a lone member in the singular", async () => {
    server.use(
      trips(
        makeSummary({
          member_count: 7,
          members_preview: [
            { person_id: "a", display_name: "Ana" },
            { person_id: "b", display_name: "Beto" },
            { person_id: "c", display_name: "Cami" },
            { person_id: "d", display_name: "Dani" },
          ],
        }),
        makeSummary({ id: OTHER_ID, name: "Solo", member_count: 1, members_preview: [{ person_id: "a", display_name: "Ana" }] }),
      ),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);

    const big = await screen.findByRole("link", { name: /Bariloche 2027/ });
    expect(big.querySelector(".avatar-stack-more")).toHaveTextContent("+3");
    expect(big).toHaveTextContent("7 personas");
    expect(screen.getByRole("link", { name: /Solo/ })).toHaveTextContent("1 persona");
  });

  it("titles each group and keeps every card inside a list", async () => {
    today("2027-06-15");
    server.use(
      trips(
        makeSummary({ id: OTHER_ID, name: "Mendoza", start_on: null, end_on: null, status: "idea" }),
        makeSummary({ id: THIRD_ID, name: "Pinamar", start_on: "2027-01-02", end_on: "2027-01-05" }),
        makeSummary(),
      ),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);
    await screen.findByRole("link", { name: /Bariloche 2027/ });

    const titles = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(titles).toEqual([messages.trips.sections.upcoming, messages.trips.sections.undated, messages.trips.sections.past]);
    const upcoming = screen.getByRole("heading", { name: messages.trips.sections.upcoming }).parentElement!;
    expect(within(upcoming).getByRole("link", { name: /Bariloche 2027/ })).toBeInTheDocument();
    const undated = screen.getByRole("heading", { name: messages.trips.sections.undated }).parentElement!;
    expect(within(undated).getByRole("link", { name: /Mendoza/ })).toHaveTextContent(messages.trips.noDates);
    const past = screen.getByRole("heading", { name: messages.trips.sections.past }).parentElement!;
    const compact = within(past).getByRole("link", { name: /Pinamar/ });
    expect(compact).toHaveAttribute("data-variant", "compact");
    expect(compact).toHaveTextContent(messages.trips.card.pill.done);
  });

  it("uses the heading level it is told to, so it nests under a crew heading", async () => {
    server.use(trips(makeSummary()));
    renderWithProviders(<TripList crewId={CREW_ID} level={4} />);

    expect(await screen.findByRole("heading", { level: 4, name: messages.trips.sections.upcoming })).toBeInTheDocument();
  });

  it("orders upcoming trips by start date and puts a trip in progress first", async () => {
    today("2027-06-15");
    server.use(
      trips(
        makeSummary({ id: THIRD_ID, name: "Septiembre", start_on: "2027-09-01", end_on: "2027-09-04" }),
        makeSummary({ id: OTHER_ID, name: "Julio", start_on: "2027-07-10", end_on: "2027-07-12" }),
        makeSummary({ name: "Ahora", start_on: "2027-06-14", end_on: "2027-06-20" }),
      ),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);
    await screen.findByRole("link", { name: /Ahora/ });

    const names = screen.getAllByRole("link").map((link) => link.querySelector(".trip-card-title")!.textContent);
    expect(names).toEqual(["Ahora", "Julio", "Septiembre"]);
  });

  it("says where each trip stands: in N days, tomorrow, today, in progress, finished", async () => {
    today("2027-06-15");
    server.use(
      trips(
        makeSummary({ id: "a", name: "Lejos", start_on: "2027-06-25", end_on: "2027-06-27" }),
        makeSummary({ id: "b", name: "Mañana", start_on: "2027-06-16", end_on: "2027-06-17" }),
        makeSummary({ id: "c", name: "Hoy", start_on: "2027-06-15", end_on: "2027-06-15" }),
        makeSummary({ id: "d", name: "Andando", start_on: "2027-06-13", end_on: "2027-06-18" }),
        makeSummary({ id: "e", name: "Vieja", start_on: "2027-05-01", end_on: "2027-05-03" }),
      ),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);
    await screen.findByRole("link", { name: /Lejos/ });

    const pill = (name: RegExp) => screen.getByRole("link", { name }).querySelector(".trip-card-pill");
    expect(pill(/Lejos/)).toHaveTextContent("en 10 días");
    expect(pill(/Mañana/)).toHaveTextContent(messages.trips.card.pill.tomorrow);
    expect(pill(/Hoy/)).toHaveTextContent(messages.trips.card.pill.today);
    expect(pill(/Andando/)).toHaveTextContent(messages.trips.card.pill.ongoing);
    expect(pill(/Vieja/)).toHaveTextContent(messages.trips.card.pill.done);
    expect(pill(/Hoy/)).toHaveAttribute("data-tone", "live");
    expect(pill(/Lejos/)).toHaveAttribute("data-tone", "quiet");
  });

  it("gives an undated trip no pill", async () => {
    server.use(trips(makeSummary({ start_on: null, end_on: null })));
    renderWithProviders(<TripList crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: /Bariloche 2027/ });
    expect(link.querySelector(".trip-card-pill")).toBeNull();
  });

  it("does not repeat the trip the hero already features, and says so when it is the only one", async () => {
    server.use(trips(makeSummary(), makeSummary({ id: OTHER_ID, name: "Mendoza" })));
    const { unmount } = renderWithProviders(<TripList crewId={CREW_ID} featuredTripId={TRIP_ID} />);

    expect(await screen.findByRole("link", { name: /Mendoza/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Bariloche 2027/ })).not.toBeInTheDocument();
    unmount();

    server.use(trips(makeSummary()));
    renderWithProviders(<TripList crewId={CREW_ID} featuredTripId={TRIP_ID} />);
    expect(await screen.findByText(messages.trips.list.onlyFeatured)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("numbers the cards in one entrance sequence across groups", async () => {
    today("2027-06-15");
    server.use(
      trips(
        makeSummary({ id: "a", name: "Uno", start_on: "2027-07-01", end_on: "2027-07-02" }),
        makeSummary({ id: "b", name: "Dos", start_on: "2027-08-01", end_on: "2027-08-02" }),
        makeSummary({ id: "c", name: "Tres", start_on: null, end_on: null }),
        makeSummary({ id: "d", name: "Cuatro", start_on: "2027-01-01", end_on: "2027-01-02" }),
      ),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);
    await screen.findByRole("link", { name: /Uno/ });

    const order = screen.getAllByRole("link").map((link) => (link as HTMLElement).style.getPropertyValue("--i"));
    expect(order).toEqual(["0", "1", "2", "3"]);
  });
});

describe("TripList card media", () => {
  it("shows a lazy, decorative cover from the versioned private endpoint when the trip has one", async () => {
    server.use(trips(makeSummary({ has_cover: true, cover_version: 3 })));
    renderWithProviders(<TripList crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: /Bariloche 2027/ });
    const photo = link.querySelector(".trip-card-media img")!;
    expect(photo).toHaveAttribute("src", `/api/trips/${TRIP_ID}/cover?v=3`);
    expect(photo).toHaveAttribute("loading", "lazy");
    expect(photo).toHaveAttribute("alt", "");
    expect(link.querySelector(".trip-card-media")).toHaveAttribute("aria-hidden", "true");
    // The picture adds nothing to the link's accessible name.
    expect(link.querySelector(".trip-card-media svg")).toBeNull();
  });

  it("without a cover shows the still of the scene the destination points to", async () => {
    server.use(trips(makeSummary({ has_cover: false, destination_label: "Mar del Plata", name: "Finde" })));
    renderWithProviders(<TripList crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: /Finde/ });
    const still = link.querySelector<HTMLImageElement>(".trip-card-media img")!;
    expect(still.getAttribute("src")).toMatch(/^\/ambient\/beach\.[0-9a-f]+\.webp$/);
    expect(still).toHaveAttribute("data-scene", "beach");
    expect(still).toHaveAttribute("alt", "");
    expect(still).toHaveAttribute("loading", "lazy");
  });

  it("falls back to the illustration when the cover cannot load and then the still cannot either", async () => {
    server.use(trips(makeSummary({ has_cover: true, cover_version: 1 })));
    renderWithProviders(<TripList crewId={CREW_ID} />);
    const link = await screen.findByRole("link", { name: /Bariloche 2027/ });

    fireEvent.error(link.querySelector(".trip-card-media img")!);
    const still = link.querySelector(".trip-card-media img")!;
    expect(still.getAttribute("src")).toMatch(/^\/ambient\//);

    fireEvent.error(still);
    expect(link.querySelector(".trip-card-media img")).toBeNull();
    expect(link.querySelector(".trip-card-media svg.trip-cover-art")).toHaveAttribute("aria-hidden", "true");
  });

  it("falls back per trip, not for the whole list", async () => {
    server.use(
      trips(
        makeSummary({ has_cover: true, cover_version: 1 }),
        makeSummary({ id: OTHER_ID, name: "Mendoza", has_cover: true, cover_version: 1 }),
      ),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);
    const first = await screen.findByRole("link", { name: /Bariloche 2027/ });
    const second = screen.getByRole("link", { name: /Mendoza/ });

    fireEvent.error(first.querySelector(".trip-card-media img")!);

    expect(first.querySelector(".trip-card-media img")!.getAttribute("src")).toMatch(/^\/ambient\//);
    expect(second.querySelector(".trip-card-media img")).toHaveAttribute("src", `/api/trips/${OTHER_ID}/cover?v=1`);
  });

  it("never renders a video in a card", async () => {
    server.use(trips(makeSummary(), makeSummary({ id: OTHER_ID, name: "Mendoza", has_cover: true, cover_version: 1 })));
    const { container } = renderWithProviders(<TripList crewId={CREW_ID} />);

    await screen.findByRole("link", { name: /Bariloche 2027/ });
    expect(container.querySelectorAll(".trip-card-media").length).toBe(2);
    expect(container.querySelector("video, .ambient-media")).toBeNull();
  });
});
