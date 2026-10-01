import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { makeMe } from "@/features/trips/fixtures";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { components } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import {
  DECISION_ID,
  HttpResponse,
  csrfHandler,
  errorBody,
  getAvailability,
  http,
  makeAvailability,
  makeWindow,
} from "../test/handlers";
import { AvailabilityEditor, SAVE_DEBOUNCE_MS } from "./AvailabilityEditor";

const m = messages.dates;
const g = m.grid;
type Availability = components["schemas"]["AvailabilityOut"];

const longDay = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
const cell = (iso: string, answer: string = g.legend.empty) =>
  screen.getByRole("gridcell", { name: g.cellLabel.replace("{day}", longDay(iso)).replace("{answer}", answer) });

type Put = { answers: { date: string; answer: string | null }[] };

function setup(props: Partial<React.ComponentProps<typeof AvailabilityEditor>> = {}) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <AvailabilityEditor decisionId={DECISION_ID} onCloseWindow={() => {}} debounceMs={20} {...props} />
    </MeProvider>,
  );
}

/** A PUT handler that records every body and answers with the grid the api would return. */
function recordPuts(respond: (put: Put) => Availability = () => makeAvailability()) {
  const puts: Put[] = [];
  server.use(
    http.put("/api/decisions/{decision_id}/availability", async ({ request }) => {
      const put = (await request.json()) as Put;
      puts.push(put);
      return HttpResponse.json(respond(put));
    }),
  );
  return puts;
}

afterEach(() => resetCsrfToken());

describe("AvailabilityEditor", () => {
  it("shows the saved debounce of 800 ms by default", () => {
    expect(SAVE_DEBOUNCE_MS).toBe(800);
  });

  it("renders my answers from the server, the group, the best windows and who is missing", async () => {
    server.use(getAvailability(makeAvailability()));
    setup();

    expect(await screen.findByRole("gridcell", { name: new RegExp(`${g.legend.yes}$`) })).toBeInTheDocument();
    expect(cell("2027-07-05", g.legend.yes)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: m.heatmap.title })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: m.best.title })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: m.missing.title })).getByText("Fede")).toBeInTheDocument();
  });

  it("batches rapid taps into one debounced PUT and shows them optimistically", async () => {
    server.use(csrfHandler, getAvailability(makeAvailability()));
    const puts = recordPuts();
    setup();
    await screen.findByRole("grid", { name: g.label });

    fireEvent.click(cell("2027-07-06"));
    fireEvent.click(cell("2027-07-07"));
    fireEvent.click(cell("2027-07-06", g.legend.yes)); // yes -> maybe before anything was sent
    fireEvent.click(cell("2027-07-05", g.legend.yes)); // yes -> maybe

    // Optimistic: visible at once, nothing sent yet.
    expect(cell("2027-07-06", g.legend.maybe)).toBeInTheDocument();
    expect(cell("2027-07-07", g.legend.yes)).toBeInTheDocument();
    expect(puts).toHaveLength(0);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].answers).toEqual([
      { date: "2027-07-05", answer: "maybe" },
      { date: "2027-07-06", answer: "maybe" },
      { date: "2027-07-07", answer: "yes" },
    ]);
  });

  it("sends pending taps through the request chain when leaving before the debounce fires", async () => {
    server.use(csrfHandler, getAvailability(makeAvailability()));
    const puts = recordPuts();
    const view = setup({ debounceMs: 60_000 });
    await screen.findByRole("grid", { name: g.label });

    fireEvent.click(cell("2027-07-06"));
    expect(puts).toHaveLength(0);
    view.unmount();

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].answers).toEqual([{ date: "2027-07-06", answer: "yes" }]);
  });

  it("counts my own answers in the group heatmap", async () => {
    server.use(getAvailability(makeAvailability()));
    setup();

    const label = m.heatmap.cellLabel.replace("{day}", longDay("2027-07-05")).replace("{yes}", "1").replace("{maybe}", "0");
    expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
  });

  it("sends a cleared day as null", async () => {
    server.use(csrfHandler, getAvailability(makeAvailability()));
    const puts = recordPuts();
    setup();
    await screen.findByRole("grid", { name: g.label });

    fireEvent.keyDown(cell("2027-07-05", g.legend.yes), { key: "Delete" });

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].answers).toEqual([{ date: "2027-07-05", answer: null }]);
  });

  it("keeps the optimistic state while saving and adopts the api's grid afterwards", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      csrfHandler,
      getAvailability(makeAvailability()),
      http.put("/api/decisions/{decision_id}/availability", async () => {
        await gate;
        return HttpResponse.json(
          makeAvailability({ best_windows: [makeWindow({ start: "2027-07-06", end: "2027-07-12" })] }),
        );
      }),
    );
    setup();
    await screen.findByRole("grid", { name: g.label });

    fireEvent.click(cell("2027-07-08"));
    await waitFor(() => expect(screen.getByText(g.saving)).toBeInTheDocument());
    expect(cell("2027-07-08", g.legend.yes)).toBeInTheDocument();

    release();
    await waitFor(() => expect(screen.queryByText(g.saving)).not.toBeInTheDocument());
    // The best windows came from the PUT response, not from a refetch.
    expect(screen.getByText(m.best.line.replace("{start}", "6 jul").replace("{end}", "12 jul").replace("{full}", "2"))).toBeInTheDocument();
  });

  it("rolls back and explains when the decision was closed meanwhile", async () => {
    server.use(
      csrfHandler,
      getAvailability(makeAvailability()),
      http.put("/api/decisions/{decision_id}/availability", ({ response }) =>
        response(409).json(errorBody("decision_closed")),
      ),
    );
    setup();
    await screen.findByRole("grid", { name: g.label });

    fireEvent.click(cell("2027-07-08"));
    expect(cell("2027-07-08", g.legend.yes)).toBeInTheDocument();

    expect(await screen.findByRole("alert")).toHaveTextContent(m.errors.decision_closed);
    await waitFor(() => expect(cell("2027-07-08")).toBeInTheDocument()); // back to unanswered
  });

  it("forwards the window chosen for closing", async () => {
    server.use(getAvailability(makeAvailability()));
    const onCloseWindow = vi.fn();
    setup({ onCloseWindow });

    fireEvent.click(await screen.findByRole("button", { name: new RegExp(m.best.close) }));

    expect(onCloseWindow).toHaveBeenCalledWith(makeWindow());
  });

  it("explains a failed load and retries", async () => {
    let calls = 0;
    server.use(
      http.get("/api/decisions/{decision_id}/availability", ({ response }) => {
        calls += 1;
        return calls === 1 ? response(404).json(errorBody("not_found")) : response(200).json(makeAvailability());
      }),
    );
    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(m.errors.not_found);
    fireEvent.click(screen.getByRole("button", { name: m.retry }));

    expect(await screen.findByRole("grid", { name: g.label })).toBeInTheDocument();
  });
});
