import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider } from "@/features/trips/TripProvider";
import { CREW_ID, TRIP_ID, makeMe, makeTrip } from "@/features/trips/fixtures";
import { renderWithProviders } from "@/test/render";
import { CountdownCard } from "./CountdownCard";

function setup(trip = makeTrip({ start_on: "2027-07-01" })) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>
        <CountdownCard tripId={TRIP_ID} crewId={CREW_ID} />
      </TripProvider>
    </MeProvider>,
  );
}

describe("CountdownCard", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("shows the days left, counted in the trip time zone", () => {
    vi.setSystemTime(new Date("2027-06-08T15:00:00Z"));
    setup();

    expect(screen.getByText("Faltan 23 días")).toBeInTheDocument();
  });

  it("does not flip a day early because of UTC", () => {
    // 01:30 UTC is still the evening of the 7th in Buenos Aires: 24 days, not 23.
    vi.setSystemTime(new Date("2027-06-08T01:30:00Z"));
    setup();

    expect(screen.getByText("Faltan 24 días")).toBeInTheDocument();
  });

  it("says tomorrow the day before", () => {
    vi.setSystemTime(new Date("2027-06-30T15:00:00Z"));
    setup();

    expect(screen.getByText("¡Mañana arrancamos!")).toBeInTheDocument();
  });

  it("says today on the start day", () => {
    vi.setSystemTime(new Date("2027-07-01T15:00:00Z"));
    setup();

    expect(screen.getByText("¡Hoy arranca el viaje!")).toBeInTheDocument();
  });

  it("is hidden once the trip started", () => {
    vi.setSystemTime(new Date("2027-07-02T15:00:00Z"));
    const { container } = setup();

    expect(container).toBeEmptyDOMElement();
  });

  it("is hidden when the trip has no start date", () => {
    vi.setSystemTime(new Date("2027-06-08T15:00:00Z"));
    const { container } = setup(makeTrip({ start_on: null }));

    expect(container).toBeEmptyDOMElement();
  });
});
