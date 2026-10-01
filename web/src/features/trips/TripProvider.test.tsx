import { act, screen } from "@testing-library/react";
import { createOpenApiHttp } from "openapi-msw";
import { describe, expect, it, vi } from "vitest";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { TRIP_ID, makeTrip } from "./fixtures";
import { TripProvider, useTripContext } from "./TripProvider";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });

function Probe() {
  const { trip, modules, participants, myRsvp, refetch } = useTripContext();
  return (
    <div>
      <p data-testid="name">{trip.name}</p>
      <p data-testid="modules">{modules.join(",")}</p>
      <p data-testid="participants">{participants.length}</p>
      <p data-testid="rsvp">{myRsvp}</p>
      <button onClick={() => void refetch()}>refetch</button>
    </div>
  );
}

describe("TripProvider", () => {
  it("exposes the trip, its modules, participants and my RSVP", () => {
    renderWithProviders(
      <TripProvider trip={makeTrip({ modules: ["dates", "budget"], my_rsvp: "maybe" })}>
        <Probe />
      </TripProvider>,
    );

    expect(screen.getByTestId("name")).toHaveTextContent("Bariloche 2027");
    expect(screen.getByTestId("modules")).toHaveTextContent("dates,budget");
    expect(screen.getByTestId("participants")).toHaveTextContent("2");
    expect(screen.getByTestId("rsvp")).toHaveTextContent("maybe");
  });

  it("refetches the trip from the api and updates the context", async () => {
    server.use(
      http.get("/api/trips/{trip_id}", ({ params, response }) => {
        expect(params.trip_id).toBe(TRIP_ID);
        return response(200).json(makeTrip({ name: "Bariloche renombrado" }));
      }),
    );
    renderWithProviders(
      <TripProvider trip={makeTrip()}>
        <Probe />
      </TripProvider>,
    );

    await act(async () => {
      screen.getByText("refetch").click();
    });

    expect(await screen.findByText("Bariloche renombrado")).toBeInTheDocument();
  });

  it("throws when used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderWithProviders(<Probe />)).toThrow(/TripProvider/);

    spy.mockRestore();
  });
});
