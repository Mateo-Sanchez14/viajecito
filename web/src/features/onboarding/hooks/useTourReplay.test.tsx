import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeProvider, type Me } from "@/features/auth/MeProvider";
import { CREW_ID, TRIP_ID, makeMe } from "@/features/trips/fixtures";
import { TourProvider } from "../TourProvider";
import { CaptureTour, tour } from "../test/captureTour";
import { useTourReplay } from "./useTourReplay";

const push = vi.fn();
let pathname = "/";
let params: Record<string, string> = {};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
  useParams: () => params,
}));

const OVERVIEW = `/crews/${CREW_ID}/trips/${TRIP_ID}`;
const OTHER_CREW = "33333333-3333-4333-8333-333333333333";
const OTHER_TRIP = "44444444-4444-4444-8444-444444444444";

function Probe() {
  const replay = useTourReplay();
  return replay.available ? (
    <button type="button" onClick={replay.replay}>
      replay
    </button>
  ) : null;
}

const crew = (id: string, defaultTripId: string | null): Me["crews"][number] => ({
  id,
  name: id,
  role: "member",
  gastito_group_url: null,
  default_trip_id: defaultTripId,
});

function setup(crews: Me["crews"], provider = true) {
  const tree = (
    <MeProvider me={makeMe({ crews })}>
      <CaptureTour />
      <Probe />
    </MeProvider>
  );
  return render(provider ? <TourProvider>{tree}</TourProvider> : tree);
}

beforeEach(() => {
  push.mockReset();
  pathname = "/";
  params = {};
});

describe("useTourReplay", () => {
  it("starts in place on the overview of the trip on screen", () => {
    pathname = OVERVIEW;
    params = { crewId: CREW_ID, tripId: TRIP_ID };
    setup([crew(CREW_ID, null)]);

    fireEvent.click(screen.getByText("replay"));

    expect(tour.running).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("routes to that trip's overview from another section and leaves a pending start", () => {
    pathname = `${OVERVIEW}/proposals`;
    params = { crewId: CREW_ID, tripId: TRIP_ID };
    setup([crew(CREW_ID, null)]);

    fireEvent.click(screen.getByText("replay"));

    expect(push).toHaveBeenCalledWith(OVERVIEW);
    expect(tour.running).toBe(false);
    expect(tour.isPending()).toBe(true);
  });

  it("from home goes to the default trip of the first crew that has one", () => {
    setup([crew("a", null), crew(CREW_ID, TRIP_ID), crew(OTHER_CREW, OTHER_TRIP)]);

    fireEvent.click(screen.getByText("replay"));

    expect(push).toHaveBeenCalledWith(OVERVIEW);
    expect(tour.isPending()).toBe(true);
  });

  it("is hidden with no trip on screen and no default trip", () => {
    setup([crew(CREW_ID, null)]);

    expect(screen.queryByText("replay")).not.toBeInTheDocument();
  });

  it("is hidden without a tour provider", () => {
    setup([crew(CREW_ID, TRIP_ID)], false);

    expect(screen.queryByText("replay")).not.toBeInTheDocument();
  });
});
