import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { TripProvider } from "../TripProvider";
import { makeMe, makeParticipant, makeTrip } from "../fixtures";
import { RsvpControl } from "./RsvpControl";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));
const t = messages.trips.rsvp;

/** What the api returns for the refetch after the mutation settles. */
function tripWith(rsvp: "in" | "out") {
  return http.get("/api/trips/{trip_id}", ({ response }) =>
    response(200).json(makeTrip({ my_rsvp: rsvp, participants: [makeParticipant({ rsvp })] })),
  );
}

function setup(myRsvp: "in" | "maybe" | "out" | "pending" = "in") {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip({ my_rsvp: myRsvp, participants: [makeParticipant({ rsvp: myRsvp })] })}>
        <RsvpControl />
      </TripProvider>
    </MeProvider>,
  );
}
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("RsvpControl", () => {
  afterEach(() => resetCsrfToken());

  it("marks the current answer as pressed", () => {
    setup("maybe");

    expect(pressed(t.maybe)).toBe("true");
    expect(pressed(t.in)).toBe("false");
    expect(pressed(t.out)).toBe("false");
  });

  it("updates optimistically, before the api answers", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      csrf,
      http.put("/api/trips/{trip_id}/participation", async () => {
        await gate;
        return HttpResponse.json(makeParticipant({ rsvp: "out" }));
      }),
      tripWith("out"),
    );
    setup("in");

    fireEvent.click(screen.getByRole("button", { name: t.out }));

    // The api has not answered yet (the PUT is held at the gate) and the UI already flipped.
    await waitFor(() => expect(pressed(t.out)).toBe("true"));
    expect(pressed(t.in)).toBe("false");
    release();
    await waitFor(() => expect(pressed(t.out)).toBe("true"));
  });

  it("disables the options while the answer is being saved", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      csrf,
      http.put("/api/trips/{trip_id}/participation", async () => {
        await gate;
        return HttpResponse.json(makeParticipant({ rsvp: "out" }));
      }),
      tripWith("out"),
    );
    setup("in");

    fireEvent.click(screen.getByRole("button", { name: t.out }));

    await waitFor(() => expect(screen.getByRole("button", { name: t.maybe })).toBeDisabled());
    expect(screen.getByRole("button", { name: t.in })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: t.maybe })).toBeEnabled());
  });

  it("rolls back and shows an error when the api fails", async () => {
    server.use(
      csrf,
      http.put("/api/trips/{trip_id}/participation", ({ response }) =>
        response(400).json({ code: "invalid_request", message: "x" }),
      ),
      tripWith("in"),
    );
    setup("in");

    fireEvent.click(screen.getByRole("button", { name: t.out }));

    expect(await screen.findByText(t.failed)).toBeInTheDocument();
    await waitFor(() => expect(pressed(t.in)).toBe("true"));
    expect(pressed(t.out)).toBe("false");
  });
});
