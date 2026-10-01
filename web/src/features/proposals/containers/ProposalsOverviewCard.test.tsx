import { screen, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { describe, expect, it } from "vitest";
import { tripCards } from "@/features/trips/cards";
import { CREW_ID, TRIP_ID } from "@/features/trips/fixtures";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { makeSummary, makeTally } from "../test/handlers";
import { ProposalsOverviewCard } from "./ProposalsOverviewCard";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const t = messages.proposals.overview;

const setup = () => renderWithProviders(<ProposalsOverviewCard tripId={TRIP_ID} crewId={CREW_ID} />);

describe("ProposalsOverviewCard", () => {
  it("links to the section and shows counts plus the top proposals with their score", async () => {
    server.use(
      http.get("/api/trips/{trip_id}/proposals/summary", ({ response }) =>
        response(200).json({
          counts: { proposed: 3, chosen: 1, discussing: 2 },
          top: [
            makeSummary({ id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Cabana del lago", tally: makeTally({ score: 4 }) }),
            makeSummary({ id: "22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Parrilla", tally: makeTally({ score: 1 }) }),
          ],
        }),
      ),
    );
    setup();

    expect(await screen.findByText(t.counts.replace("{proposed}", "3").replace("{chosen}", "1"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.title })).toHaveAttribute(
      "href",
      `/crews/${CREW_ID}/trips/${TRIP_ID}/proposals`,
    );
    const items = within(screen.getByRole("list", { name: t.topLabel })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Cabana del lago");
    expect(items[0]).toHaveTextContent("4 puntos");
    expect(within(items[0]).getByRole("link", { name: "Cabana del lago" })).toHaveAttribute(
      "href",
      `/crews/${CREW_ID}/trips/${TRIP_ID}/proposals/11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    );
  });

  it("defaults missing counts to zero", async () => {
    server.use(
      http.get("/api/trips/{trip_id}/proposals/summary", ({ response }) =>
        response(200).json({ counts: { proposed: 2 }, top: [makeSummary()] }),
      ),
    );
    setup();

    expect(await screen.findByText(t.counts.replace("{proposed}", "2").replace("{chosen}", "0"))).toBeInTheDocument();
  });

  it("says there are no proposals yet and still links to the section", async () => {
    server.use(
      http.get("/api/trips/{trip_id}/proposals/summary", ({ response }) =>
        response(200).json({ counts: {}, top: [] }),
      ),
    );
    setup();

    expect(await screen.findByText(t.empty)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: t.topLabel })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.title })).toBeInTheDocument();
  });

  it("keeps the link when the summary cannot load", async () => {
    server.use(
      http.get("/api/trips/{trip_id}/proposals/summary", () =>
        HttpResponse.json({ code: "boom", message: "x" }, { status: 500 }),
      ),
    );
    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(messages.proposals.loadFailed);
    expect(screen.getByRole("link", { name: t.title })).toBeInTheDocument();
  });
});

describe("tripCards registry", () => {
  it("registers the proposals card for the proposals module, first in order", () => {
    const card = tripCards.find((entry) => entry.key === "proposals");

    expect(card).toMatchObject({ module: "proposals", order: 10, Component: ProposalsOverviewCard });
  });
});
