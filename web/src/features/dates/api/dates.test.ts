import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/errors";
import { resetCsrfToken } from "@/shared/api/csrf";
import { server } from "@/test/server";
import {
  DECISION_ID,
  HttpResponse,
  csrfHandler,
  errorBody,
  getAvailability,
  http,
  listDecisions,
  makeAvailability,
  makeDecision,
} from "../test/handlers";
import {
  closeDecision,
  getAvailability as fetchAvailability,
  listDecisions as fetchDecisions,
  openDecision,
  reopenDecision,
  setAvailability,
  updateDecision,
} from "./dates";

const TRIP = "22222222-2222-4222-8222-222222222222";

describe("dates api", () => {
  afterEach(() => resetCsrfToken());

  it("lists a trip's decisions", async () => {
    server.use(listDecisions([makeDecision()]));

    expect(await fetchDecisions(TRIP)).toEqual([makeDecision()]);
  });

  it("reads the availability grid", async () => {
    const availability = makeAvailability();
    server.use(getAvailability(availability));

    expect(await fetchAvailability(DECISION_ID)).toEqual(availability);
  });

  it("opens a decision with the given body", async () => {
    let body: unknown;
    server.use(
      csrfHandler,
      http.post("/api/trips/{trip_id}/decisions", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeDecision(), { status: 201 });
      }),
    );

    await openDecision(TRIP, { kind: "dates", window_start: "2027-07-05", window_end: "2027-07-18", min_days: 7 });

    expect(body).toEqual({ kind: "dates", window_start: "2027-07-05", window_end: "2027-07-18", min_days: 7 });
  });

  it("patches, puts my answers, closes and reopens", async () => {
    const calls: string[] = [];
    let putBody: unknown;
    let closeBody: unknown;
    server.use(
      csrfHandler,
      http.patch("/api/decisions/{decision_id}", ({ response }) => {
        calls.push("patch");
        return response(200).json(makeDecision());
      }),
      http.put("/api/decisions/{decision_id}/availability", async ({ request, response }) => {
        calls.push("put");
        putBody = await request.json();
        return response(200).json(makeAvailability());
      }),
      http.post("/api/decisions/{decision_id}/close", async ({ request, response }) => {
        calls.push("close");
        closeBody = await request.json();
        return response(200).json(makeDecision({ status: "closed" }));
      }),
      http.post("/api/decisions/{decision_id}/reopen", ({ response }) => {
        calls.push("reopen");
        return response(200).json(makeDecision());
      }),
    );

    await updateDecision(DECISION_ID, { min_days: 5 });
    await setAvailability(DECISION_ID, [{ date: "2027-07-05", answer: null }]);
    await closeDecision(DECISION_ID, { start_on: "2027-07-12", end_on: "2027-07-18" });
    await reopenDecision(DECISION_ID);

    expect(calls).toEqual(["patch", "put", "close", "reopen"]);
    expect(putBody).toEqual({ answers: [{ date: "2027-07-05", answer: null }] });
    expect(closeBody).toEqual({ start_on: "2027-07-12", end_on: "2027-07-18" });
  });

  it("throws an ApiError carrying the code of an error body", async () => {
    server.use(
      csrfHandler,
      http.post("/api/decisions/{decision_id}/close", ({ response }) =>
        response(409).json(errorBody("decision_closed")),
      ),
    );

    await expect(closeDecision(DECISION_ID, {})).rejects.toMatchObject({
      code: "decision_closed",
      status: 409,
    });
    await expect(closeDecision(DECISION_ID, {})).rejects.toBeInstanceOf(ApiError);
  });
});
