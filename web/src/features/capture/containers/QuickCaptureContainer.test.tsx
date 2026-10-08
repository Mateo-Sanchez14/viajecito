import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, delay, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { makeTask } from "@/features/logistics/test/handlers";
import { useProposalsSummary } from "@/features/proposals/hooks/queries";
import { makeProposal } from "@/features/proposals/test/handlers";
import { CREW_ID, TRIP_ID, makeMe, makeTrip } from "@/features/trips/fixtures";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { components } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { QuickCaptureContainer } from "./QuickCaptureContainer";

let params: Record<string, string> = {};
let pathname = "/";
vi.mock("next/navigation", () => ({ useParams: () => params, usePathname: () => pathname }));

const t = messages.capture;
const tripPage = { crewId: CREW_ID, tripId: TRIP_ID };
const NEW_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const crew = (id: string, name: string, defaultTripId: string | null): components["schemas"]["CrewSummaryOut"] => ({
  id,
  name,
  role: "member",
  gastito_group_url: null,
  default_trip_id: defaultTripId,
});

type Sent = { method: string; path: string; body: unknown };
let sent: Sent[] = [];
let requests: string[] = [];
let summaryFetches = 0;

/** A probe that keeps the proposals summary query active, to observe the refetch a capture causes. */
function SummaryProbe() {
  useProposalsSummary(TRIP_ID);
  return null;
}

function useApi({ trip = makeTrip() } = {}) {
  server.use(
    http.get("*/api/auth/csrf", () => HttpResponse.json({ csrf_token: "tok" })),
    http.get("*/api/trips/:id", ({ params: p }) => HttpResponse.json(makeTrip({ ...trip, id: String(p.id) }))),
    http.get("*/api/trips/:id/proposals/summary", () => {
      summaryFetches += 1;
      return HttpResponse.json({ counts: {}, top: [] });
    }),
  );
}

function recordPost(path: string, respond: () => Response | Promise<Response>) {
  server.use(
    http.post(path, async ({ request }) => {
      sent.push({ method: "POST", path: new URL(request.url).pathname, body: await request.json() });
      return respond();
    }),
  );
}

function setup(me = makeMe({ crews: [crew(CREW_ID, "Los Pibes", TRIP_ID)] })) {
  return renderWithProviders(
    <MeProvider me={me}>
      <QuickCaptureContainer />
      <SummaryProbe />
    </MeProvider>,
  );
}

const trigger = () => screen.getByRole("button", { name: t.trigger });
const dialog = () => screen.getByRole("dialog", { name: t.title });
const open = () => fireEvent.click(trigger());
const pick = (title: string) => fireEvent.click(within(dialog()).getByRole("button", { name: new RegExp(title) }));
const type = (label: string, value: string) =>
  fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });
const submit = (name: string) => fireEvent.click(within(dialog()).getByRole("button", { name }));

describe("QuickCaptureContainer", () => {
  beforeEach(() => {
    params = tripPage;
    pathname = `/crews/${CREW_ID}/trips/${TRIP_ID}`;
    sent = [];
    requests = [];
    summaryFetches = 0;
    server.events.on("request:start", ({ request }) => {
      requests.push(`${request.method} ${new URL(request.url).pathname}`);
    });
    useApi();
  });
  afterEach(() => {
    server.events.removeAllListeners();
    resetCsrfToken();
  });

  describe("trigger and sheet", () => {
    it("is the tour's capture anchor without changing its role or name", () => {
      setup();

      expect(trigger()).toHaveAttribute("data-tour", "capture");
    });

    it("shows an icon button named 'Agregar rápido' that is not a navigation link", () => {
      setup();

      expect(trigger()).toBeVisible();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens a labelled sheet with the three choices and names the trip", async () => {
      setup();
      open();

      expect(dialog()).toBeInTheDocument();
      const menu = within(dialog()).getByRole("list", { name: t.menu.label });
      expect(within(menu).getAllByRole("button").map((button) => button.textContent)).toEqual([
        t.menu.link.title + t.menu.link.hint,
        t.menu.idea.title + t.menu.idea.hint,
        t.menu.task.title + t.menu.task.hint,
      ]);
      expect(await within(dialog()).findByText(t.target.replace("{name}", "Bariloche 2027"))).toBeInTheDocument();
    });

    it("closes on Escape and gives focus back to the trigger", () => {
      setup();
      trigger().focus(); // a real click focuses the button; fireEvent.click does not
      open();

      act(() => {
        screen.getByRole("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger()).toHaveFocus();
    });

    it("goes back to the menu from a form", () => {
      setup();
      open();
      pick(t.menu.idea.title);
      expect(within(dialog()).getByRole("form", { name: t.idea.title })).toBeInTheDocument();

      submit(t.back);

      expect(within(dialog()).getByRole("list", { name: t.menu.label })).toBeInTheDocument();
    });

    it("moves focus to the first field of the chosen form", () => {
      setup();
      open();
      pick(t.menu.link.title);

      expect(within(dialog()).getByLabelText(t.link.url)).toHaveFocus();
    });

    it("is not offered outside trip pages and home", () => {
      params = {};
      pathname = "/me/notifications";
      setup();

      expect(screen.queryByRole("button", { name: t.trigger })).not.toBeInTheDocument();
    });
  });

  describe("target trip", () => {
    it("sends the capture to the trip of the route", async () => {
      recordPost("*/api/trips/:id/proposals", () => HttpResponse.json(makeProposal({ id: NEW_ID }), { status: 201 }));
      setup();
      open();
      pick(t.menu.link.title);
      type(t.link.url, "https://example.com/hotel");
      submit(t.link.submit);

      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0].path).toBe(`/api/trips/${TRIP_ID}/proposals`);
    });

    it("uses the only default trip on home", async () => {
      params = {};
      pathname = "/";
      const other = "99999999-9999-4999-8999-999999999999";
      recordPost("*/api/trips/:id/tasks", () => HttpResponse.json(makeTask(), { status: 201 }));
      setup(makeMe({ crews: [crew("c0", "Sin viaje", null), crew("c1", "Los Pibes", other)] }));
      open();
      pick(t.menu.task.title);
      type(t.task.name, "Reservar auto");
      submit(t.task.submit);

      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0].path).toBe(`/api/trips/${other}/tasks`);
    });

    it("asks which trip when several crews have a default and blocks submit until one is chosen", async () => {
      params = {};
      pathname = "/";
      const d1 = "aaaaaaaa-0000-4000-8000-000000000001";
      const d2 = "aaaaaaaa-0000-4000-8000-000000000002";
      recordPost("*/api/trips/:id/tasks", () => HttpResponse.json(makeTask(), { status: 201 }));
      setup(makeMe({ crews: [crew("c1", "Los Pibes", d1), crew("c2", "Familia", d2)] }));
      open();

      const chooser = within(dialog()).getByLabelText(t.chooser.label);
      expect(chooser).toHaveValue("");
      pick(t.menu.task.title);
      type(t.task.name, "Comprar seguro");
      expect(within(dialog()).getByRole("button", { name: t.task.submit })).toBeDisabled();
      expect(within(dialog()).getByText(t.errors.tripRequired)).toBeInTheDocument();

      fireEvent.change(chooser, { target: { value: d2 } });
      expect(within(dialog()).getByRole("button", { name: t.task.submit })).toBeEnabled();
      submit(t.task.submit);

      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0].path).toBe(`/api/trips/${d2}/tasks`);
    });

    it("renders no trigger on home when no crew has a default trip", () => {
      params = {};
      pathname = "/";
      setup(makeMe({ crews: [crew("c1", "Los Pibes", null)] }));

      expect(screen.queryByRole("button", { name: t.trigger })).not.toBeInTheDocument();
    });
  });

  describe("link", () => {
    beforeEach(() => {
      recordPost("*/api/trips/:id/proposals", () => HttpResponse.json(makeProposal({ id: NEW_ID }), { status: 201 }));
    });

    function openLink() {
      setup();
      open();
      pick(t.menu.link.title);
    }

    it("creates a proposal from the url, closes, announces it and refreshes the proposals", async () => {
      openLink();
      await waitFor(() => expect(summaryFetches).toBe(1));
      type(t.link.url, "https://example.com/hotel");
      submit(t.link.submit);

      const status = await screen.findByRole("status");
      await waitFor(() => expect(status).toHaveTextContent(t.toast.proposal));
      expect(sent[0].body).toEqual({ url: "https://example.com/hotel" });
      expect(within(status).getByRole("link", { name: t.toast.view })).toHaveAttribute(
        "href",
        `/crews/${CREW_ID}/trips/${TRIP_ID}/proposals/${NEW_ID}`,
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(summaryFetches).toBeGreaterThanOrEqual(2));
    });

    it("sends the optional note", async () => {
      openLink();
      type(t.link.url, "https://example.com/hotel");
      type(t.link.note, "Con desayuno");
      submit(t.link.submit);

      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0].body).toEqual({ url: "https://example.com/hotel", note: "Con desayuno" });
    });

    it("sends one request when submit is activated twice", async () => {
      server.use(
        http.post("*/api/trips/:id/proposals", async ({ request }) => {
          sent.push({ method: "POST", path: new URL(request.url).pathname, body: await request.json() });
          await delay(50);
          return HttpResponse.json(makeProposal({ id: NEW_ID }), { status: 201 });
        }),
      );
      openLink();
      type(t.link.url, "https://example.com/hotel");
      submit(t.link.submit);
      expect(within(dialog()).getByRole("button", { name: t.link.submitting })).toBeDisabled();
      fireEvent.submit(within(dialog()).getByRole("form", { name: t.link.title }));

      await screen.findByText(t.toast.proposal);
      expect(sent).toHaveLength(1);
    });

    it("does not send an empty url and ties a field error to the input", () => {
      openLink();
      submit(t.link.submit);

      const input = within(dialog()).getByLabelText(t.link.url);
      const alert = within(dialog()).getByRole("alert");
      expect(alert).toHaveTextContent(t.errors.urlRequired);
      expect(input).toHaveAttribute("aria-describedby", alert.id);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(sent).toHaveLength(0);
    });

    it("does not send text that is not an http link", () => {
      openLink();
      type(t.link.url, "hola");
      submit(t.link.submit);

      expect(within(dialog()).getByRole("alert")).toHaveTextContent(t.errors.invalidUrl);
      expect(sent).toHaveLength(0);
    });

    it("links to the proposal that already exists on a 409 and keeps the sheet and the input", async () => {
      server.use(
        http.post("*/api/trips/:id/proposals", () =>
          HttpResponse.json(
            { code: "duplicate_proposal", message: "developer text", proposal_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
            { status: 409 },
          ),
        ),
      );
      openLink();
      type(t.link.url, "https://example.com/hotel");
      submit(t.link.submit);

      const alert = await within(dialog()).findByRole("alert");
      expect(alert).toHaveTextContent(t.errors.duplicate);
      expect(within(alert).getByRole("link", { name: t.errors.seeExisting })).toHaveAttribute(
        "href",
        `/crews/${CREW_ID}/trips/${TRIP_ID}/proposals/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`,
      );
      expect(within(dialog()).getByLabelText(t.link.url)).toHaveValue("https://example.com/hotel");
      expect(screen.queryByText("developer text")).not.toBeInTheDocument();
      expect(screen.queryByRole("status")).toBeEmptyDOMElement();
    });

    it("closes the sheet when the existing proposal link is followed", async () => {
      server.use(
        http.post("*/api/trips/:id/proposals", () =>
          HttpResponse.json({ code: "duplicate_proposal", message: "x", proposal_id: NEW_ID }, { status: 409 }),
        ),
      );
      openLink();
      type(t.link.url, "https://example.com/hotel");
      submit(t.link.submit);

      const link = await within(dialog()).findByRole("link", { name: t.errors.seeExisting });
      // jsdom cannot navigate: stop the anchor's default action after React has handled the click.
      const stop = (event: Event) => event.preventDefault();
      document.addEventListener("click", stop);
      fireEvent.click(link);
      document.removeEventListener("click", stop);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it.each([
      ["invalid_url", t.errors.invalidUrl],
      ["ignored_url", t.errors.ignoredUrl],
      ["invalid_request", t.errors.invalid],
    ])("shows its own message for %s and never the developer text", async (code, copy) => {
      server.use(
        http.post("*/api/trips/:id/proposals", () =>
          HttpResponse.json({ code, message: "Developer-facing text" }, { status: 400 }),
        ),
      );
      openLink();
      type(t.link.url, "https://example.com/x");
      submit(t.link.submit);

      expect(await within(dialog()).findByRole("alert")).toHaveTextContent(copy);
      expect(screen.queryByText(/Developer-facing text/)).not.toBeInTheDocument();
      expect(within(dialog()).getByLabelText(t.link.url)).toHaveValue("https://example.com/x");
    });

    it("shows the generic message on a server error and lets the person retry", async () => {
      server.use(
        http.post("*/api/trips/:id/proposals", () => HttpResponse.json({ code: "boom", message: "x" }, { status: 500 })),
      );
      openLink();
      type(t.link.url, "https://example.com/x");
      submit(t.link.submit);

      expect(await within(dialog()).findByRole("alert")).toHaveTextContent(t.errors.failed);
      expect(within(dialog()).getByLabelText(t.link.url)).toHaveValue("https://example.com/x");
      expect(within(dialog()).getByRole("button", { name: t.link.submit })).toBeEnabled();
    });

    it("shows the generic message when the network fails", async () => {
      server.use(http.post("*/api/trips/:id/proposals", () => HttpResponse.error()));
      openLink();
      type(t.link.url, "https://example.com/x");
      submit(t.link.submit);

      expect(await within(dialog()).findByRole("alert")).toHaveTextContent(t.errors.failed);
    });
  });

  describe("idea with price", () => {
    beforeEach(() => {
      recordPost("*/api/trips/:id/proposals", () => HttpResponse.json(makeProposal({ id: NEW_ID }), { status: 201 }));
    });

    function openIdea() {
      setup();
      open();
      pick(t.menu.idea.title);
    }

    it("creates a proposal with title, price, currency and basis, and no status or transition", async () => {
      openIdea();
      type(t.idea.name, "Cena en el puerto");
      type(t.idea.price, "45000");
      type(t.idea.currency, "ars");
      submit(t.idea.submit);

      await screen.findByText(t.toast.idea);
      expect(sent).toEqual([
        {
          method: "POST",
          path: `/api/trips/${TRIP_ID}/proposals`,
          body: { title: "Cena en el puerto", est_price: "45000.00", currency: "ARS", price_basis: "total" },
        },
      ]);
      expect(sent[0].body).not.toHaveProperty("status");
      expect(requests.filter((entry) => entry.includes("transition"))).toEqual([]);
    });

    it("lets the person price per person or per night", async () => {
      openIdea();
      type(t.idea.name, "Alquiler de bicis");
      type(t.idea.price, "1.500,50");
      fireEvent.change(within(dialog()).getByLabelText(t.idea.basis), { target: { value: "per_person" } });
      submit(t.idea.submit);

      await screen.findByText(t.toast.idea);
      expect(sent[0].body).toMatchObject({ est_price: "1500.50", price_basis: "per_person" });
    });

    it("starts with the trip currency", async () => {
      useApi({ trip: makeTrip({ currency: "CLP" }) });
      openIdea();

      await waitFor(() => expect(within(dialog()).getByLabelText(t.idea.currency)).toHaveValue("CLP"));
    });

    it("starts with USD while the trip currency is USD", async () => {
      openIdea();

      await waitFor(() => expect(within(dialog()).getByLabelText(t.idea.currency)).toHaveValue("USD"));
    });

    it.each(["0", "-5", "abc", ""])("rejects the price %j without sending anything", (price) => {
      openIdea();
      type(t.idea.name, "Cena");
      type(t.idea.price, price);
      submit(t.idea.submit);

      expect(within(dialog()).getByRole("alert")).toHaveTextContent(t.errors.priceInvalid);
      expect(within(dialog()).getByLabelText(t.idea.price)).toHaveAttribute("aria-invalid", "true");
      expect(sent).toHaveLength(0);
    });

    it("requires a title and a three-letter currency", () => {
      openIdea();
      type(t.idea.price, "100");
      type(t.idea.currency, "US");
      submit(t.idea.submit);

      const alerts = within(dialog()).getAllByRole("alert").map((alert) => alert.textContent);
      expect(alerts).toEqual([t.errors.titleRequired, t.errors.currencyInvalid]);
      expect(sent).toHaveLength(0);
    });

    it("explains the budget rule in exactly one line", () => {
      openIdea();

      expect(within(dialog()).getAllByText(t.idea.budgetNote)).toHaveLength(1);
    });

    it("keeps the input and shows the mapped message when the api rejects it", async () => {
      server.use(
        http.post("*/api/trips/:id/proposals", () =>
          HttpResponse.json({ code: "invalid_request", message: "Developer-facing text" }, { status: 400 }),
        ),
      );
      openIdea();
      type(t.idea.name, "Cena");
      type(t.idea.price, "100");
      submit(t.idea.submit);

      expect(await within(dialog()).findByRole("alert")).toHaveTextContent(t.errors.invalid);
      expect(within(dialog()).getByLabelText(t.idea.name)).toHaveValue("Cena");
      expect(screen.queryByText(/Developer-facing text/)).not.toBeInTheDocument();
    });
  });

  describe("task", () => {
    beforeEach(() => {
      recordPost("*/api/trips/:id/tasks", () => HttpResponse.json(makeTask(), { status: 201 }));
    });

    function openTask() {
      setup();
      open();
      pick(t.menu.task.title);
    }

    it("creates a to-do by default and refreshes the tasks", async () => {
      let tasksFetches = 0;
      server.use(
        http.get("*/api/trips/:id/tasks", () => {
          tasksFetches += 1;
          return HttpResponse.json([]);
        }),
      );
      openTask();
      type(t.task.name, "Reservar auto");
      submit(t.task.submit);

      await screen.findByText(t.toast.task);
      expect(sent[0]).toEqual({
        method: "POST",
        path: `/api/trips/${TRIP_ID}/tasks`,
        body: { title: "Reservar auto", kind: "todo" },
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(within(screen.getByRole("status")).getByRole("link", { name: t.toast.view })).toHaveAttribute(
        "href",
        `/crews/${CREW_ID}/trips/${TRIP_ID}/logistics`,
      );
      expect(tasksFetches).toBe(0);
    });

    it("sends the chosen kind and the due day", async () => {
      openTask();
      type(t.task.name, "Reservar auto");
      fireEvent.change(within(dialog()).getByLabelText(t.task.kind), { target: { value: "booking" } });
      type(t.task.due, "2027-06-30");
      submit(t.task.submit);

      await screen.findByText(t.toast.task);
      expect(sent[0].body).toEqual({ title: "Reservar auto", kind: "booking", due_on: "2027-06-30" });
    });

    it("does not send without a title", () => {
      openTask();
      submit(t.task.submit);

      const alert = within(dialog()).getByRole("alert");
      expect(alert).toHaveTextContent(t.errors.titleRequired);
      expect(within(dialog()).getByLabelText(t.task.name)).toHaveAttribute("aria-describedby", alert.id);
      expect(sent).toHaveLength(0);
    });

    it("keeps the input when the api answers invalid_request", async () => {
      server.use(
        http.post("*/api/trips/:id/tasks", () =>
          HttpResponse.json({ code: "invalid_request", message: "Developer-facing text" }, { status: 400 }),
        ),
      );
      openTask();
      type(t.task.name, "Reservar auto");
      submit(t.task.submit);

      expect(await within(dialog()).findByRole("alert")).toHaveTextContent(t.errors.invalid);
      expect(within(dialog()).getByLabelText(t.task.name)).toHaveValue("Reservar auto");
      expect(screen.queryByText(/Developer-facing text/)).not.toBeInTheDocument();
    });
  });

  it("never calls a budget write endpoint in any capture flow", async () => {
    recordPost("*/api/trips/:id/proposals", () => HttpResponse.json(makeProposal({ id: NEW_ID }), { status: 201 }));
    recordPost("*/api/trips/:id/tasks", () => HttpResponse.json(makeTask(), { status: 201 }));
    setup();

    open();
    pick(t.menu.link.title);
    type(t.link.url, "https://example.com/a");
    submit(t.link.submit);
    await screen.findByText(t.toast.proposal);

    open();
    pick(t.menu.idea.title);
    type(t.idea.name, "Cena");
    type(t.idea.price, "100");
    submit(t.idea.submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    open();
    pick(t.menu.task.title);
    type(t.task.name, "Reservar");
    submit(t.task.submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(sent).toHaveLength(3);
    const writes = requests.filter((entry) => !entry.startsWith("GET "));
    expect(writes.filter((entry) => entry.includes("/budget"))).toEqual([]);
    expect(writes.filter((entry) => entry.includes("fx_rates"))).toEqual([]);
  });
});
