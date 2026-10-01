import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { tripKeys } from "@/features/trips/api/trips";
import { makeTrip } from "@/features/trips/fixtures";
import { resetCsrfToken } from "@/shared/api/csrf";
import { server } from "@/test/server";
import { datesKeys } from "../api/dates";
import {
  DECISION_ID,
  csrfHandler,
  errorBody,
  http,
  makeDecision,
} from "../test/handlers";
import { useCloseDecision, useOpenDecision, useReopenDecision } from "./mutations";
import { availabilityQueryOptions, decisionsQueryOptions } from "./queries";

const TRIP = makeTrip().id;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("dates query options", () => {
  it("polls decisions and availability every 60 seconds", () => {
    expect(decisionsQueryOptions(TRIP).queryKey).toEqual(["dates", TRIP, "decisions"]);
    expect(decisionsQueryOptions(TRIP).refetchInterval).toBe(60_000);
    expect(availabilityQueryOptions(DECISION_ID).queryKey).toEqual([
      "dates",
      "decision",
      DECISION_ID,
      "availability",
    ]);
    expect(availabilityQueryOptions(DECISION_ID).refetchInterval).toBe(60_000);
  });

  it("pauses availability polling while a local edit is pending", () => {
    expect(availabilityQueryOptions(DECISION_ID, { paused: true }).refetchInterval).toBe(false);
  });
});

describe("dates mutations", () => {
  afterEach(() => resetCsrfToken());

  it("closing invalidates the trip, so the shell shows the new dates", async () => {
    server.use(
      csrfHandler,
      http.post("/api/decisions/{decision_id}/close", ({ response }) =>
        response(200).json(makeDecision({ status: "closed" })),
      ),
    );
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(tripKeys.detail(TRIP), makeTrip());
    queryClient.setQueryData(datesKeys.decisions(TRIP), [makeDecision()]);
    const { result } = renderHook(() => useCloseDecision(TRIP, DECISION_ID), { wrapper });

    await result.current.mutateAsync({});

    await waitFor(() => expect(queryClient.getQueryState(tripKeys.detail(TRIP))?.isInvalidated).toBe(true));
    expect(queryClient.getQueryState(datesKeys.decisions(TRIP))?.isInvalidated).toBe(true);
  });

  it("opening refreshes the decisions list", async () => {
    server.use(
      csrfHandler,
      http.post("/api/trips/{trip_id}/decisions", () =>
        Response.json(makeDecision(), { status: 201 }),
      ),
    );
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(datesKeys.decisions(TRIP), []);
    const { result } = renderHook(() => useOpenDecision(TRIP), { wrapper });

    await result.current.mutateAsync({
      kind: "dates",
      window_start: "2027-07-05",
      window_end: "2027-07-18",
      min_days: 7,
    });

    await waitFor(() => expect(queryClient.getQueryState(datesKeys.decisions(TRIP))?.isInvalidated).toBe(true));
  });

  it("reopening refreshes the decisions list and surfaces the api code on conflict", async () => {
    server.use(
      csrfHandler,
      http.post("/api/decisions/{decision_id}/reopen", ({ response }) =>
        response(409).json(errorBody("decision_already_open")),
      ),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useReopenDecision(TRIP, DECISION_ID), { wrapper });

    await expect(result.current.mutateAsync()).rejects.toMatchObject({ code: "decision_already_open" });
  });
});
