import { screen } from "@testing-library/react";
import { createOpenApiHttp } from "openapi-msw";
import { describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { makeMe, makeSummary } from "@/features/trips/fixtures";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../messages/es-AR";
import Home from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });

describe("home page", () => {
  it("is the hero and the trips, with no ops health card for regular users", async () => {
    // Any /api/health request would be unhandled and fail the test: the card must not even mount.
    server.use(http.get("/api/crews/{crew_id}/trips", ({ response }) => response(200).json([makeSummary()])));
    renderWithProviders(
      <MeProvider me={makeMe()}>
        <Home />
      </MeProvider>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: messages.trips.title })).toBeInTheDocument();
    await screen.findByRole("link", { name: messages.home.hero.open });
    expect(screen.queryByText(messages.ops.health.title)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.ops.health.ok)).not.toBeInTheDocument();
  });
});
