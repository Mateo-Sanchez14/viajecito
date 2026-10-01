import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { server } from "@/test/server";
import { CREW_ID, TRIP_ID, makeParticipant, makeSummary, makeTrip } from "../fixtures";
import { createTrip, getTrip, listTrips, patchTrip, setRsvp } from "./trips";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });

const csrf = http.get("/api/auth/csrf", ({ response }) =>
  response(200).json({ csrf_token: "tok" }),
);

describe("trips api", () => {
  afterEach(() => resetCsrfToken());

  it("lists the trips of a crew", async () => {
    server.use(
      http.get("/api/crews/{crew_id}/trips", ({ params, response }) => {
        expect(params.crew_id).toBe(CREW_ID);
        return response(200).json([makeSummary()]);
      }),
    );

    await expect(listTrips(CREW_ID)).resolves.toEqual([makeSummary()]);
  });

  it("creates a trip with the CSRF header and returns it", async () => {
    let seen: { body: unknown; csrf: string | null } | undefined;
    server.use(
      csrf,
      http.post("/api/crews/{crew_id}/trips", async ({ request, response }) => {
        seen = { body: await request.json(), csrf: request.headers.get("x-csrftoken") };
        return response(201).json(makeTrip());
      }),
    );

    const payload = { name: "Bariloche 2027", type: "generic", destination_label: "", currency: "USD" };
    const trip = await createTrip(CREW_ID, payload);

    expect(trip.id).toBe(TRIP_ID);
    expect(seen).toEqual({ body: payload, csrf: "tok" });
  });

  it("gets one trip", async () => {
    server.use(
      http.get("/api/trips/{trip_id}", ({ response }) => response(200).json(makeTrip())),
    );

    await expect(getTrip(TRIP_ID)).resolves.toMatchObject({ id: TRIP_ID, my_rsvp: "in" });
  });

  it("patches a trip", async () => {
    server.use(
      csrf,
      http.patch("/api/trips/{trip_id}", async ({ request, response }) => {
        expect(await request.json()).toEqual({ status: "booked" });
        return response(200).json(makeTrip({ status: "booked" }));
      }),
    );

    await expect(patchTrip(TRIP_ID, { status: "booked" })).resolves.toMatchObject({
      status: "booked",
    });
  });

  it("sets my RSVP", async () => {
    server.use(
      csrf,
      http.put("/api/trips/{trip_id}/participation", async ({ request, response }) => {
        expect(await request.json()).toEqual({ rsvp: "out" });
        return response(200).json(makeParticipant({ rsvp: "out" }));
      }),
    );

    await expect(setRsvp(TRIP_ID, "out")).resolves.toMatchObject({ rsvp: "out" });
  });

  it("throws an ApiError carrying the api code on failure", async () => {
    server.use(
      http.get("/api/trips/{trip_id}", ({ response }) =>
        response(404).json({ code: "not_found", message: "nope" }),
      ),
    );

    await expect(getTrip(TRIP_ID)).rejects.toMatchObject({ code: "not_found", status: 404 });
  });
});
