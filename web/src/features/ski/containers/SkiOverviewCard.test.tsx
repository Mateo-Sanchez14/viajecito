import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CREW_ID, TRIP_ID } from "@/features/trips/fixtures";
import { tripCards } from "@/features/trips/cards";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { skiOverviewHandler } from "../test/handlers";
import { ME_REF, RESORT_ID, makeOverview, makeReport, makeTripResort } from "../test/fixtures";
import { SkiOverviewCard } from "./SkiOverviewCard";

const t = messages.ski;
const setup = () => renderWithProviders(<SkiOverviewCard tripId={TRIP_ID} crewId={CREW_ID} />);

describe("SkiOverviewCard", () => {
  it("shows the first resort's base and new snow, and how many people lack a pass", async () => {
    server.use(
      skiOverviewHandler(
        makeOverview({
          passes: {
            rows: [],
            missing: [
              { person: ME_REF, resort_id: RESORT_ID },
              { person: ME_REF, resort_id: null },
            ],
          },
        }),
      ),
    );
    setup();

    expect(await screen.findByText("Cerro Catedral")).toBeInTheDocument();
    expect(screen.getByText(t.card.summary.replace("{base}", "120 cm").replace("{fresh}", "15,5 cm"))).toBeInTheDocument();
    expect(screen.getByText(t.passes.missing.replace("{n}", "2"))).toBeInTheDocument();
  });

  it("flags stale conditions", async () => {
    server.use(
      skiOverviewHandler(
        makeOverview({ resorts: [makeTripResort({ latest_report: makeReport({ stale: true, age_hours: 30 }) })] }),
      ),
    );
    setup();

    expect(await screen.findByText(t.conditions.stale.replace("{hours}", "30"))).toBeInTheDocument();
  });

  it("says there is no snow data yet when the resort has no report", async () => {
    server.use(skiOverviewHandler(makeOverview({ resorts: [makeTripResort({ latest_report: null })] })));
    setup();

    expect(await screen.findByText(t.card.noReport)).toBeInTheDocument();
  });

  it("asks to pick a resort when the trip has none", async () => {
    server.use(skiOverviewHandler(makeOverview({ resorts: [] })));
    setup();

    expect(await screen.findByText(t.empty.resorts)).toBeInTheDocument();
  });

  it("links to the ski section", async () => {
    server.use(skiOverviewHandler());
    setup();

    expect(await screen.findByRole("link")).toHaveAttribute("href", `/crews/${CREW_ID}/trips/${TRIP_ID}/ski`);
  });

  it("is registered in the overview cards for the ski module", () => {
    expect(tripCards).toContainEqual(
      expect.objectContaining({ key: "ski", module: "ski", order: 15, Component: SkiOverviewCard }),
    );
  });
});
