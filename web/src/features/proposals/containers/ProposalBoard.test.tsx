import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { CREW_ID, TRIP_ID, makeMe, makeTrip } from "@/features/trips/fixtures";
import { TripProvider } from "@/features/trips/TripProvider";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { components, paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { makeProposal, makeSummary, PROPOSAL_ID } from "../test/handlers";
import { ProposalBoard } from "./ProposalBoard";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));
const t = messages.proposals;

type Summary = components["schemas"]["ProposalSummaryOut"];

/** Serves `items` for the list and records every query string the board asked for. */
function serveList(items: Summary[] | ((search: URLSearchParams) => Summary[])) {
  const searches: URLSearchParams[] = [];
  server.use(
    http.get("/api/trips/{trip_id}/proposals", ({ request, response }) => {
      const search = new URL(request.url).searchParams;
      searches.push(search);
      return response(200).json(typeof items === "function" ? items(search) : items);
    }),
  );
  return searches;
}

function setup() {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip()}>
        <ProposalBoard tripId={TRIP_ID} crewId={CREW_ID} />
      </TripProvider>
    </MeProvider>,
  );
}

const lodging = makeSummary({ id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Cabana del lago" });
const food = makeSummary({ id: "22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Parrilla El Boliche", category: "food" });

describe("ProposalBoard", () => {
  afterEach(() => resetCsrfToken());

  it("lists the proposals, each linking to its detail and with vote buttons", async () => {
    const searches = serveList([lodging, food]);
    setup();

    const link = await screen.findByRole("link", { name: "Cabana del lago" });
    expect(link).toHaveAttribute("href", `/crews/${CREW_ID}/trips/${TRIP_ID}/proposals/${lodging.id}`);
    expect(screen.getByRole("link", { name: "Parrilla El Boliche" })).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: t.vote.label })).toHaveLength(2);
    expect([...searches[0].keys()]).toEqual([]);
  });

  it("sends a category filter to the api and shows what comes back", async () => {
    const searches = serveList((search) => (search.getAll("category").includes("food") ? [food] : [lodging, food]));
    setup();
    await screen.findByRole("link", { name: "Cabana del lago" });

    const group = screen.getByRole("group", { name: t.filters.category });
    fireEvent.click(within(group).getByRole("button", { name: t.category.food }));

    await waitFor(() => expect(screen.queryByRole("link", { name: "Cabana del lago" })).not.toBeInTheDocument());
    expect(within(group).getByRole("button", { name: t.category.food })).toHaveAttribute("aria-pressed", "true");
    expect(searches.at(-1)?.getAll("category")).toEqual(["food"]);
  });

  it("sends status, include_discarded and sort filters", async () => {
    const searches = serveList([lodging]);
    setup();
    await screen.findByRole("link", { name: "Cabana del lago" });

    fireEvent.click(
      within(screen.getByRole("group", { name: t.filters.status })).getByRole("button", { name: t.status.chosen }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: t.filters.showDiscarded }));
    fireEvent.change(screen.getByRole("combobox", { name: t.filters.sort }), { target: { value: "score" } });

    await waitFor(() => {
      const last = searches.at(-1)!;
      expect(last.getAll("status")).toEqual(["chosen"]);
      expect(last.get("include_discarded")).toBe("true");
      expect(last.get("sort")).toBe("score");
    });
  });

  it("shows the WhatsApp hint when the trip has no proposals", async () => {
    serveList([]);
    setup();

    expect(await screen.findByText(t.empty.title)).toBeInTheDocument();
    expect(screen.getByText(t.empty.body)).toBeInTheDocument();
  });

  it("says no proposal matches the filters and lets you clear them", async () => {
    const searches = serveList((search) => (search.getAll("category").length ? [] : [lodging]));
    setup();
    await screen.findByRole("link", { name: "Cabana del lago" });

    fireEvent.click(
      within(screen.getByRole("group", { name: t.filters.category })).getByRole("button", {
        name: t.category.gear,
      }),
    );

    expect(await screen.findByText(t.filters.empty)).toBeInTheDocument();
    expect(screen.queryByText(t.empty.title)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.filters.clear }));

    expect(await screen.findByRole("link", { name: "Cabana del lago" })).toBeInTheDocument();
    expect([...searches.at(-1)!.keys()]).toEqual([]);
  });

  it("shows an error with a retry when the list cannot load", async () => {
    let calls = 0;
    server.use(
      http.get("/api/trips/{trip_id}/proposals", ({ response }) => {
        calls += 1;
        return calls === 1 ? HttpResponse.json({ code: "boom", message: "x" }, { status: 500 }) : response(200).json([lodging]);
      }),
    );
    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(t.loadFailed);
    fireEvent.click(screen.getByRole("button", { name: t.retry }));

    expect(await screen.findByRole("link", { name: "Cabana del lago" })).toBeInTheDocument();
  });

  describe("add form", () => {
    async function openForm() {
      await screen.findByRole("link", { name: "Cabana del lago" });
      fireEvent.click(screen.getByRole("button", { name: t.add.open }));
      return screen.getByRole("form", { name: t.add.title });
    }

    it("validates before sending: a link or a title is required", async () => {
      serveList([lodging]);
      let posted = false;
      server.use(csrf, http.post("/api/trips/{trip_id}/proposals", () => {
        posted = true;
        return HttpResponse.json(makeProposal(), { status: 201 });
      }));
      setup();
      const form = await openForm();

      fireEvent.click(within(form).getByRole("button", { name: t.add.submit }));

      expect(await within(form).findByText(t.add.errors.needUrlOrTitle)).toBeInTheDocument();
      expect(posted).toBe(false);
    });

    it("rejects a link that is not http(s)", async () => {
      serveList([lodging]);
      setup();
      const form = await openForm();

      fireEvent.change(within(form).getByLabelText(t.add.url), { target: { value: "ftp://x.com" } });
      fireEvent.click(within(form).getByRole("button", { name: t.add.submit }));

      expect(await within(form).findByText(t.add.errors.urlInvalid)).toBeInTheDocument();
    });

    it("creates the proposal from a pasted link, then closes the form and refreshes the list", async () => {
      let items = [lodging];
      serveList(() => items);
      let body: unknown = null;
      server.use(
        csrf,
        http.post("/api/trips/{trip_id}/proposals", async ({ request }) => {
          body = await request.json();
          items = [food, lodging];
          return HttpResponse.json(makeProposal({ id: food.id, title: food.title }), { status: 201 });
        }),
      );
      setup();
      const form = await openForm();

      fireEvent.change(within(form).getByLabelText(t.add.url), { target: { value: "https://www.airbnb.com/rooms/1" } });
      fireEvent.click(within(form).getByRole("button", { name: t.add.submit }));

      expect(await screen.findByRole("link", { name: "Parrilla El Boliche" })).toBeInTheDocument();
      expect(body).toEqual({ url: "https://www.airbnb.com/rooms/1" });
      expect(screen.queryByRole("form", { name: t.add.title })).not.toBeInTheDocument();
    });

    it("sends a manual proposal with category, price and dates", async () => {
      serveList([lodging]);
      let body: unknown = null;
      server.use(
        csrf,
        http.post("/api/trips/{trip_id}/proposals", async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(makeProposal(), { status: 201 });
        }),
      );
      setup();
      const form = await openForm();

      fireEvent.change(within(form).getByLabelText(t.add.titleField), { target: { value: "Refugio Frey" } });
      fireEvent.change(within(form).getByLabelText(t.add.category), { target: { value: "lodging" } });
      fireEvent.change(within(form).getByLabelText(t.add.price), { target: { value: "120,5" } });
      fireEvent.change(within(form).getByLabelText(t.add.basis), { target: { value: "per_night" } });
      fireEvent.change(within(form).getByLabelText(t.add.startsOn), { target: { value: "2027-07-01" } });
      fireEvent.change(within(form).getByLabelText(t.add.endsOn), { target: { value: "2027-07-03" } });
      fireEvent.click(within(form).getByRole("button", { name: t.add.submit }));

      await waitFor(() => expect(body).not.toBeNull());
      expect(body).toEqual({
        title: "Refugio Frey",
        category: "lodging",
        est_price: "120.50",
        currency: "USD",
        price_basis: "per_night",
        starts_on: "2027-07-01",
        ends_on: "2027-07-03",
      });
    });

    it("blocks an end date before the start date", async () => {
      serveList([lodging]);
      setup();
      const form = await openForm();

      fireEvent.change(within(form).getByLabelText(t.add.titleField), { target: { value: "x" } });
      fireEvent.change(within(form).getByLabelText(t.add.startsOn), { target: { value: "2027-07-05" } });
      fireEvent.change(within(form).getByLabelText(t.add.endsOn), { target: { value: "2027-07-01" } });
      fireEvent.click(within(form).getByRole("button", { name: t.add.submit }));

      expect(await within(form).findByText(t.add.errors.endBeforeStart)).toBeInTheDocument();
    });

    it("on 409 duplicate_proposal explains it and links to the existing proposal", async () => {
      serveList([lodging]);
      server.use(
        csrf,
        http.post("/api/trips/{trip_id}/proposals", () => {
          const body: components["schemas"]["DuplicateProposalOut"] = {
            code: "duplicate_proposal",
            message: "x",
            proposal_id: PROPOSAL_ID,
          };
          return HttpResponse.json(body, { status: 409 });
        }),
      );
      setup();
      const form = await openForm();

      fireEvent.change(within(form).getByLabelText(t.add.url), { target: { value: "https://a.com/x" } });
      fireEvent.click(within(form).getByRole("button", { name: t.add.submit }));

      expect(await within(form).findByRole("alert")).toHaveTextContent(t.errors.duplicate_proposal);
      expect(within(form).getByRole("link", { name: t.add.seeExisting })).toHaveAttribute(
        "href",
        `/crews/${CREW_ID}/trips/${TRIP_ID}/proposals/${PROPOSAL_ID}`,
      );
    });

    it("maps other api codes to their copy", async () => {
      serveList([lodging]);
      server.use(
        csrf,
        http.post("/api/trips/{trip_id}/proposals", ({ response }) =>
          response(400).json({ code: "ignored_url", message: "x" }),
        ),
      );
      setup();
      const form = await openForm();

      fireEvent.change(within(form).getByLabelText(t.add.url), { target: { value: "https://wa.me/123" } });
      fireEvent.click(within(form).getByRole("button", { name: t.add.submit }));

      expect(await within(form).findByRole("alert")).toHaveTextContent(t.errors.ignored_url);
    });
  });
});
