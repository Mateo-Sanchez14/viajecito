import { fireEvent, screen, waitForElementToBeRemoved } from "@testing-library/react";
import { createOpenApiHttp } from "openapi-msw";
import { describe, expect, it } from "vitest";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { CREW_ID, TRIP_ID, formatDay, makeSummary } from "../fixtures";
import { TripList } from "./TripList";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });

function trips(...rows: ReturnType<typeof makeSummary>[]) {
  return http.get("/api/crews/{crew_id}/trips", ({ response }) => response(200).json(rows));
}

describe("TripList", () => {
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

  it("shows the empty state when the crew has no trips", async () => {
    server.use(trips());
    renderWithProviders(<TripList crewId={CREW_ID} />);

    expect(await screen.findByText(messages.trips.list.empty)).toBeInTheDocument();
  });

  it("lists each trip as a link to its page with status and dates", async () => {
    server.use(
      trips(
        makeSummary(),
        makeSummary({ id: "44444444-4444-4444-8444-444444444444", name: "Mendoza", start_on: null, end_on: null, status: "idea" }),
      ),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: new RegExp("Bariloche 2027") });
    expect(link).toHaveAttribute("href", `/crews/${CREW_ID}/trips/${TRIP_ID}`);
    expect(link).toHaveTextContent(messages.trips.status.planning);
    expect(link).toHaveTextContent(
      messages.trips.dateRange
        .replace("{start}", formatDay("2027-07-01"))
        .replace("{end}", formatDay("2027-07-08")),
    );
    const undated = screen.getByRole("link", { name: new RegExp("Mendoza") });
    expect(undated).toHaveTextContent(messages.trips.noDates);
    expect(undated).toHaveTextContent(messages.trips.status.idea);
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
});

describe("TripList ticket", () => {
  it("draws each trip as a ticket with a perforated stub holding the status", async () => {
    server.use(trips(makeSummary()));
    renderWithProviders(<TripList crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: /Bariloche 2027/ });
    expect(link).toHaveClass("trip-ticket");
    const stub = link.querySelector(".trip-ticket-stub") as HTMLElement;
    expect(stub).toHaveTextContent(messages.trips.status.planning);
    expect(stub.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("illustrates the empty list", async () => {
    server.use(trips());
    const { container } = renderWithProviders(<TripList crewId={CREW_ID} />);

    await screen.findByText(messages.trips.list.empty);
    expect(container.querySelector("svg[data-scene='map']")).toHaveAttribute("aria-hidden", "true");
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

describe("TripList ticket media", () => {
  const OTHER_ID = "44444444-4444-4444-8444-444444444444";

  it("shows a lazy, decorative cover from the versioned private endpoint when the trip has one", async () => {
    server.use(trips(makeSummary({ has_cover: true, cover_version: 3 })));
    renderWithProviders(<TripList crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: /Bariloche 2027/ });
    const photo = link.querySelector(".trip-ticket-media img")!;
    expect(photo).toHaveAttribute("src", `/api/trips/${TRIP_ID}/cover?v=3`);
    expect(photo).toHaveAttribute("loading", "lazy");
    expect(photo).toHaveAttribute("alt", "");
    expect(link.querySelector(".trip-ticket-media svg")).toBeNull();
    // The picture adds nothing to the link's accessible name.
    expect(link).toHaveAccessibleName(/^Bariloche 2027/);
    expect(link.querySelector(".trip-ticket-media")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the trip illustration when it has no cover, and requests no image", async () => {
    server.use(trips(makeSummary({ has_cover: false })));
    renderWithProviders(<TripList crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: /Bariloche 2027/ });
    expect(link.querySelector(".trip-ticket-media img")).toBeNull();
    expect(link.querySelector(".trip-ticket-media svg.trip-cover-art")).toHaveAttribute("aria-hidden", "true");
  });

  it("never renders a video in a ticket, with or without footage elsewhere", async () => {
    server.use(trips(makeSummary({ has_cover: false }), makeSummary({ id: OTHER_ID, name: "Mendoza", has_cover: true, cover_version: 1 })));
    const { container } = renderWithProviders(<TripList crewId={CREW_ID} />);

    await screen.findByRole("link", { name: /Bariloche 2027/ });
    expect(container.querySelectorAll(".trip-ticket-media").length).toBe(2);
    expect(container.querySelector(".trip-ticket-media video, .trip-ticket-media .ambient-media")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("keeps the ticket illustration still: the live class belongs to the hero only", async () => {
    server.use(trips(makeSummary({ has_cover: false })));
    renderWithProviders(<TripList crewId={CREW_ID} />);

    const link = await screen.findByRole("link", { name: /Bariloche 2027/ });
    expect(link.querySelector(".trip-ticket-media svg.trip-cover-art")).not.toHaveClass("trip-cover-art-live");
  });

  it("falls back to the illustration when the cover cannot load, per trip", async () => {
    server.use(
      trips(
        makeSummary({ has_cover: true, cover_version: 1 }),
        makeSummary({ id: OTHER_ID, name: "Mendoza", has_cover: true, cover_version: 1 }),
      ),
    );
    renderWithProviders(<TripList crewId={CREW_ID} />);
    const first = await screen.findByRole("link", { name: /Bariloche 2027/ });
    const second = screen.getByRole("link", { name: /Mendoza/ });

    fireEvent.error(first.querySelector(".trip-ticket-media img")!);

    expect(first.querySelector(".trip-ticket-media img")).toBeNull();
    expect(first.querySelector(".trip-ticket-media svg.trip-cover-art")).toBeInTheDocument();
    expect(second.querySelector(".trip-ticket-media img")).toBeInTheDocument();
  });
});
