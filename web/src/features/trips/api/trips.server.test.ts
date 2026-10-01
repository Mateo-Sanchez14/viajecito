// @vitest-environment node
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { TRIP_ID, makeTrip } from "../fixtures";
import { getTripServer } from "./trips.server";

const url = `http://localhost:8000/api/trips/${TRIP_ID}`;

describe("getTripServer", () => {
  it("forwards the session cookie and returns the trip", async () => {
    let cookie: string | null = null;
    server.use(
      http.get(url, ({ request }) => {
        cookie = request.headers.get("cookie");
        return HttpResponse.json(makeTrip());
      }),
    );

    const trip = await getTripServer("sessionid=abc", TRIP_ID);

    expect(trip?.id).toBe(TRIP_ID);
    expect(cookie).toBe("sessionid=abc");
  });

  it("returns null on 404 so the page can render notFound()", async () => {
    server.use(
      http.get(url, () => HttpResponse.json({ code: "not_found", message: "x" }, { status: 404 })),
    );

    await expect(getTripServer("sessionid=abc", TRIP_ID)).resolves.toBeNull();
  });

  it("throws on any other failure instead of pretending the trip is missing", async () => {
    server.use(http.get(url, () => HttpResponse.json({ code: "boom", message: "x" }, { status: 500 })));

    await expect(getTripServer("sessionid=abc", TRIP_ID)).rejects.toThrow(/500/);
  });
});
