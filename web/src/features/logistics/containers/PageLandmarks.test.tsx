import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider } from "@/features/trips/TripProvider";
import { makeMe, makeTrip } from "@/features/trips/fixtures";
import { expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { TripShell } from "@/ui/organisms/TripShell";
import { LogisticsBoard } from "./LogisticsBoard";
import { BudgetView } from "@/features/budget/containers/BudgetView";
import { DocumentVault } from "@/features/documents/containers/DocumentVault";

it.each([
  ["logistics", <LogisticsBoard key="logistics" tripId="t1" />],
  ["budget", <BudgetView key="budget" tripId="t1" crewId="c1" />],
  ["documents", <DocumentVault key="documents" tripId="t1" />],
])("preserves the parent page landmarks for %s", (_name, child) => {
  server.use(
    http.get("*/api/trips/:id/tasks", () => HttpResponse.json([])),
    http.get("*/api/trips/:id/budget", () => HttpResponse.json({})),
    http.get("*/api/trips/:id/documents", () => HttpResponse.json([])),
  );
  const { container } = renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip()}>
        <main>
          <TripShell title="Trip" subtitle="" navLabel="Trip" navItems={[]}>
            {child}
          </TripShell>
        </main>
      </TripProvider>
    </MeProvider>,
  );
  expect(container.querySelectorAll("main")).toHaveLength(1);
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  expect(container.querySelector("h2")).toBeInTheDocument();
});
