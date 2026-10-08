import { fireEvent, screen, within } from "@testing-library/react";
import { createOpenApiHttp } from "openapi-msw";
import { describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { CREW_ID, makeMe, makeSummary } from "../fixtures";
import { CrewTrips } from "./CrewTrips";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const OTHER_CREW = "55555555-5555-4555-8555-555555555555";
const MENDOZA = makeSummary({ id: "44444444-4444-4444-8444-444444444444", name: "Mendoza", start_on: "2027-09-01", end_on: "2027-09-03" });
const crew = (id: string, name: string) => ({
  id,
  name,
  role: "member" as const,
  gastito_group_url: null,
  default_trip_id: null,
});

function serve(rows: Record<string, ReturnType<typeof makeSummary>[]>, calls: string[] = []) {
  server.use(
    http.get("/api/crews/{crew_id}/trips", ({ params, response }) => {
      calls.push(params.crew_id);
      return response(200).json(rows[params.crew_id] ?? []);
    }),
  );
  return calls;
}

const setup = (me = makeMe()) =>
  renderWithProviders(
    <MeProvider me={me}>
      <CrewTrips />
    </MeProvider>,
  );

describe("CrewTrips with one crew", () => {
  it("titles the page 'Mis viajes' and adds no crew heading", async () => {
    serve({ [CREW_ID]: [makeSummary(), MENDOZA] });
    setup();

    expect(screen.getByRole("heading", { level: 2, name: messages.trips.title })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Los Pibes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    // The groups sit right under the title.
    expect(await screen.findByRole("heading", { level: 3, name: messages.trips.sections.upcoming })).toBeInTheDocument();
  });

  it("leaves the featured trip to the hero and lists the others", async () => {
    serve({ [CREW_ID]: [makeSummary(), MENDOZA] });
    setup();

    expect(await screen.findByRole("link", { name: /Mendoza/ })).toBeInTheDocument();
    // Bariloche is the next trip: the hero shows it, the list does not repeat it.
    expect(screen.queryByRole("link", { name: /Bariloche 2027/ })).not.toBeInTheDocument();
  });

  it("opens the new-trip sheet from the button beside the title", async () => {
    serve({ [CREW_ID]: [MENDOZA] });
    setup();

    fireEvent.click(screen.getByRole("button", { name: messages.trips.create.open }));

    const sheet = await screen.findByRole("dialog", { name: messages.trips.create.title });
    expect(within(sheet).getByLabelText(messages.trips.create.destination)).toBeInTheDocument();
    expect(within(sheet).queryByText(/^En /)).not.toBeInTheDocument();
  });

  it("keeps no create form inline", async () => {
    serve({ [CREW_ID]: [makeSummary(), MENDOZA] });
    setup();
    await screen.findByRole("link", { name: /Mendoza/ });

    expect(screen.queryByLabelText(messages.trips.create.destination)).not.toBeInTheDocument();
  });
});

describe("CrewTrips with several crews", () => {
  const me = () => makeMe({ crews: [crew(CREW_ID, "Los Pibes"), crew(OTHER_CREW, "Familia")] });

  it("gives each crew its own heading under the title, with groups one level lower", async () => {
    const calls = serve({ [CREW_ID]: [makeSummary(), MENDOZA], [OTHER_CREW]: [] });
    setup(me());

    expect(screen.getByRole("heading", { level: 2, name: messages.trips.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Los Pibes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Familia" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 4, name: messages.trips.sections.upcoming })).toBeInTheDocument();
    expect(await screen.findByText(messages.trips.list.empty)).toBeInTheDocument();
    expect(new Set(calls)).toEqual(new Set([CREW_ID, OTHER_CREW]));
  });

  it("offers one new-trip button per crew and says which crew the sheet is for", async () => {
    serve({});
    setup(me());

    const buttons = screen.getAllByRole("button", { name: messages.trips.create.open });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);

    expect(await screen.findByText(messages.trips.create.forCrew.replace("{crew}", "Familia"))).toBeInTheDocument();
  });
});

describe("CrewTrips without crews", () => {
  it("keeps the crews empty state and offers no create button", () => {
    setup(makeMe({ crews: [] }));

    expect(screen.getByRole("heading", { level: 2, name: messages.trips.title })).toBeInTheDocument();
    expect(screen.getByText(messages.home.crews.empty)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.trips.create.open })).not.toBeInTheDocument();
  });
});
