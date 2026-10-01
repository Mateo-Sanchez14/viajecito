import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { CREW_ID, TRIP_ID, formatDay, makeMe, makeTrip } from "@/features/trips/fixtures";
import { TripProvider } from "@/features/trips/TripProvider";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { components, paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { makeComment, makePreview, makeProposal, makeTally, PROPOSAL_ID } from "../test/handlers";
import { ProposalDetail } from "./ProposalDetail";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));
const t = messages.proposals;

type Proposal = components["schemas"]["ProposalOut"];

function serve(proposal: Proposal) {
  let current = proposal;
  server.use(
    csrf,
    http.get("/api/proposals/{proposal_id}", ({ response }) => response(200).json(current)),
    http.get("/api/proposals/{proposal_id}/comments", ({ response }) => response(200).json([makeComment()])),
  );
  return { set: (next: Proposal) => (current = next), get: () => current };
}

function setup() {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip()}>
        <ProposalDetail proposalId={PROPOSAL_ID} />
      </TripProvider>
    </MeProvider>,
  );
}

describe("ProposalDetail", () => {
  afterEach(() => resetCsrfToken());

  it("shows the title, status, category, price, dates and note", async () => {
    serve(
      makeProposal({
        est_price: "300.00",
        currency: "USD",
        price_basis: "per_night",
        starts_on: "2027-07-01",
        ends_on: "2027-07-08",
        note: "Con desayuno incluido",
      }),
    );
    setup();

    expect(await screen.findByRole("heading", { level: 1, name: "Llao Llao Resort" })).toBeInTheDocument();
    expect(screen.getByText(t.status.proposed)).toBeInTheDocument();
    expect(screen.getByText(t.category.lodging)).toBeInTheDocument();
    expect(screen.getByText(/300,00/)).toBeInTheDocument();
    expect(
      screen.getByText(
        messages.trips.dateRange.replace("{start}", formatDay("2027-07-01")).replace("{end}", formatDay("2027-07-08")),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Con desayuno incluido")).toBeInTheDocument();
  });

  it("links back to the board and out to the original page safely", async () => {
    serve(makeProposal());
    setup();

    expect(await screen.findByRole("link", { name: t.back })).toHaveAttribute(
      "href",
      `/crews/${CREW_ID}/trips/${TRIP_ID}/proposals`,
    );
    const open = screen.getByRole("link", { name: t.detail.openLink });
    expect(open).toHaveAttribute("href", "https://www.booking.com/hotel/ar/llao-llao.html");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("renders the comment thread", async () => {
    serve(makeProposal());
    setup();

    expect(await screen.findByText("Se ve buenisimo")).toBeInTheDocument();
  });

  it("lists who voted what", async () => {
    serve(
      makeProposal({
        tally: makeTally({ up: 1, down: 1, score: 0 }),
        votes: [
          { person: { person_id: "p1", display_name: "Lucia" }, value: 1 },
          { person: { person_id: "p2", display_name: "Nico" }, value: -1 },
        ],
      }),
    );
    setup();

    const list = await screen.findByRole("list", { name: t.detail.votes });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Lucia");
    expect(items[0]).toHaveTextContent(t.vote.up);
    expect(items[1]).toHaveTextContent("Nico");
    expect(items[1]).toHaveTextContent(t.vote.down);
  });

  it("says nobody voted yet", async () => {
    serve(makeProposal({ votes: [] }));
    setup();

    expect(await screen.findByText(t.detail.noVotes)).toBeInTheDocument();
  });

  it("flags a majority", async () => {
    serve(makeProposal({ tally: makeTally({ up: 3, down: 0, score: 3, majority: true }) }));
    setup();

    expect(await screen.findByText(t.detail.majority)).toBeInTheDocument();
  });

  it("shows a skeleton thumbnail and the searching copy while the preview is pending", async () => {
    serve(makeProposal({ preview: makePreview({ fetch_status: "pending", has_thumbnail: false }) }));
    setup();

    expect(await screen.findByText(t.preview.pending)).toBeInTheDocument();
  });

  it("offers a retry for an unreadable preview and explains a throttled one", async () => {
    serve(makeProposal({ preview: makePreview({ fetch_status: "blocked", has_thumbnail: false }) }));
    let refreshed = 0;
    server.use(
      http.post("/api/proposals/{proposal_id}/refresh_preview", ({ response }) => {
        refreshed += 1;
        return refreshed === 1
          ? response(202).json({ status: "queued" })
          : response(409).json({ code: "refresh_too_soon", message: "x" });
      }),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: t.preview.refresh }));
    expect(await screen.findByText(t.preview.refreshQueued)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t.preview.refresh }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.refresh_too_soon);
  });

  it("never renders a link whose scheme is not http or https", async () => {
    serve(
      makeProposal({
        preview: makePreview({ url: "javascript:alert(1)", final_url: "javascript:alert(1)", has_thumbnail: false }),
      }),
    );
    setup();

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: t.detail.openLink })).not.toBeInTheDocument();
  });

  it("does not offer a retry when the proposal has no link", async () => {
    serve(makeProposal({ preview: null }));
    setup();

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: t.preview.refresh })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: t.detail.openLink })).not.toBeInTheDocument();
  });

  describe("status", () => {
    it("moves the proposal and announces it politely", async () => {
      const api = serve(makeProposal({ allowed_transitions: ["discussing", "chosen", "discarded"] }));
      let body: unknown = null;
      server.use(
        http.post("/api/proposals/{proposal_id}/transition", async ({ request, response }) => {
          body = await request.json();
          api.set(makeProposal({ status: "chosen", allowed_transitions: ["booked", "discussing", "discarded"] }));
          return response(200).json(api.get());
        }),
      );
      setup();

      fireEvent.click(await screen.findByRole("button", { name: t.transition.chosen }));

      const live = screen.getByRole("status");
      await waitFor(() => expect(live).toHaveTextContent(t.transition.changed.replace("{status}", t.status.chosen)));
      expect(live).toHaveAttribute("aria-live", "polite");
      expect(body).toEqual({ to: "chosen" });
      expect(await screen.findByRole("button", { name: t.transition.booked })).toBeInTheDocument();
    });

    it("shows the reason when the api refuses the move", async () => {
      serve(makeProposal({ allowed_transitions: ["chosen"] }));
      server.use(
        http.post("/api/proposals/{proposal_id}/transition", ({ response }) =>
          response(409).json({ code: "invalid_transition", message: "x" }),
        ),
      );
      setup();

      fireEvent.click(await screen.findByRole("button", { name: t.transition.chosen }));

      expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.invalid_transition);
    });

    it("closes votes on a discarded proposal", async () => {
      serve(makeProposal({ status: "discarded", allowed_transitions: ["proposed"] }));
      setup();

      const group = await screen.findByRole("group", { name: t.vote.label });
      for (const button of within(group).getAllByRole("button")) expect(button).toBeDisabled();
    });
  });

  it("saves the booking reference of a chosen proposal", async () => {
    serve(makeProposal({ status: "chosen", allowed_transitions: ["booked"] }));
    let body: unknown = null;
    server.use(
      http.patch("/api/proposals/{proposal_id}", async ({ request, response }) => {
        body = await request.json();
        return response(200).json(makeProposal({ status: "chosen", booking_ref: "XYZ-9" }));
      }),
    );
    setup();

    fireEvent.change(await screen.findByLabelText(t.detail.bookingRef), { target: { value: " XYZ-9 " } });
    fireEvent.click(screen.getByRole("button", { name: t.detail.saveBookingRef }));

    await waitFor(() => expect(body).toEqual({ booking_ref: "XYZ-9" }));
  });

  it("does not show the booking reference field before the proposal is chosen", async () => {
    serve(makeProposal({ status: "proposed" }));
    setup();

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByLabelText(t.detail.bookingRef)).not.toBeInTheDocument();
  });

  it("edits the proposal through the edit form", async () => {
    const api = serve(makeProposal());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch("/api/proposals/{proposal_id}", async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        api.set(makeProposal({ title: "Nuevo titulo" }));
        return response(200).json(api.get());
      }),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: t.detail.edit }));
    const form = screen.getByRole("form", { name: t.detail.editTitle });
    fireEvent.change(within(form).getByLabelText(t.add.titleField), { target: { value: "Nuevo titulo" } });
    fireEvent.change(within(form).getByLabelText(t.add.price), { target: { value: "99" } });
    fireEvent.click(within(form).getByRole("button", { name: t.detail.save }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ title: "Nuevo titulo", est_price: "99.00", category: "lodging" });
    expect(await screen.findByRole("heading", { level: 1, name: "Nuevo titulo" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: t.detail.editTitle })).not.toBeInTheDocument();
  });

  it("will not save an edit with a blank title or an ambiguous price", async () => {
    serve(makeProposal());
    let patched = false;
    server.use(
      http.patch("/api/proposals/{proposal_id}", ({ response }) => {
        patched = true;
        return response(200).json(makeProposal());
      }),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: t.detail.edit }));
    const form = screen.getByRole("form", { name: t.detail.editTitle });
    fireEvent.change(within(form).getByLabelText(t.add.titleField), { target: { value: " " } });
    fireEvent.change(within(form).getByLabelText(t.add.price), { target: { value: "1.5000" } });
    fireEvent.click(within(form).getByRole("button", { name: t.detail.save }));

    expect(await within(form).findByText(t.add.errors.titleRequired)).toBeInTheDocument();
    expect(within(form).getByText(t.errors.invalid_price)).toBeInTheDocument();
    expect(patched).toBe(false);
  });

  it("shows a not-found state for an unknown proposal", async () => {
    server.use(
      http.get("/api/proposals/{proposal_id}", ({ response }) =>
        response(404).json({ code: "not_found", message: "x" }),
      ),
    );
    setup();

    expect(await screen.findByText(t.detail.notFound)).toBeInTheDocument();
  });

  it("shows a retry when the proposal cannot load", async () => {
    server.use(
      http.get("/api/proposals/{proposal_id}", () =>
        HttpResponse.json({ code: "boom", message: "x" }, { status: 500 }),
      ),
    );
    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(t.loadFailed);
    expect(screen.getByRole("button", { name: t.retry })).toBeInTheDocument();
  });
});
