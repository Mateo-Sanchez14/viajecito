import { screen, waitForElementToBeRemoved } from "@testing-library/react";
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
