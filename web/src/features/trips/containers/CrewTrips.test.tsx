import { screen } from "@testing-library/react";
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

describe("CrewTrips", () => {
  it("shows, per crew, its name, its trips and the create form", async () => {
    const calls: string[] = [];
    server.use(
      http.get("/api/crews/{crew_id}/trips", ({ params, response }) => {
        calls.push(params.crew_id);
        return response(200).json(params.crew_id === CREW_ID ? [makeSummary()] : []);
      }),
    );
    const me = makeMe({
      crews: [
        { id: CREW_ID, name: "Los Pibes", role: "admin", gastito_group_url: null, default_trip_id: null },
        { id: OTHER_CREW, name: "Familia", role: "member", gastito_group_url: null, default_trip_id: null },
      ],
    });

    renderWithProviders(
      <MeProvider me={me}>
        <CrewTrips />
      </MeProvider>,
    );

    expect(screen.getByRole("heading", { level: 2, name: messages.trips.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Los Pibes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Familia" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Bariloche 2027/ })).toBeInTheDocument();
    expect(await screen.findByText(messages.trips.list.empty)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: messages.trips.create.submit })).toHaveLength(2);
    expect(calls.sort()).toEqual([CREW_ID, OTHER_CREW].sort());
  });

  it("keeps the crews empty state when the person has no crews", () => {
    renderWithProviders(
      <MeProvider me={makeMe({ crews: [] })}>
        <CrewTrips />
      </MeProvider>,
    );

    expect(screen.getByRole("heading", { level: 2, name: messages.trips.title })).toBeInTheDocument();
    expect(screen.getByText(messages.home.crews.empty)).toBeInTheDocument();
  });
});
