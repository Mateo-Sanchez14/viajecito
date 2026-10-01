import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider } from "@/features/trips/TripProvider";
import { makeMe, makeTrip, TRIP_ID } from "@/features/trips/fixtures";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { http, skiOverviewHandler } from "../test/handlers";
import { LUCIA_REF, makeOverview } from "../test/fixtures";
import { SkiDashboard } from "./SkiDashboard";

const t = messages.ski;

function setup(modules = ["ski"]) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip({ modules })}>
        <SkiDashboard tripId={TRIP_ID} />
      </TripProvider>
    </MeProvider>,
  );
}

describe("SkiDashboard", () => {
  afterEach(() => server.resetHandlers());

  it("shows every section of the ski page", async () => {
    server.use(
      skiOverviewHandler(makeOverview({ levels: [{ discipline: "ski", level: "advanced", people: [LUCIA_REF] }] })),
      http.get("/api/ski/resorts", ({ response }) => response(200).json([])),
    );
    setup();

    expect(await screen.findByRole("heading", { name: t.title, level: 2 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: t.resorts.title })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: t.conditions.title })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: t.passes.title })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: t.gear.title })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: t.levels.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.profileLink })).toHaveAttribute("href", "/me/ski");
  });

  it("says the trip is not a ski trip when the module is off, without calling the api", () => {
    setup(["proposals"]);

    expect(screen.getByText(t.notSki)).toBeInTheDocument();
  });

  it("treats module_not_enabled from the api as not a ski trip", async () => {
    server.use(
      http.get("/api/trips/{trip_id}/ski", ({ response }) =>
        response(404).json({ code: "module_not_enabled", message: "x" }),
      ),
    );
    setup();

    expect(await screen.findByText(t.errors.module_not_enabled)).toBeInTheDocument();
  });

  it("offers a retry when the page cannot be loaded", async () => {
    server.use(
      http.get("/api/trips/{trip_id}/ski", ({ response }) =>
        response(404).json({ code: "not_found", message: "x" }),
      ),
    );
    setup();

    expect(await screen.findByText(t.loadFailed)).toBeInTheDocument();
    server.use(skiOverviewHandler(), http.get("/api/ski/resorts", ({ response }) => response(200).json([])));
    fireEvent.click(screen.getByRole("button", { name: t.retry }));

    expect(await screen.findByRole("heading", { name: t.conditions.title })).toBeInTheDocument();
  });
});
