import { fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider } from "@/features/trips/TripProvider";
import { makeMe, makeTrip } from "@/features/trips/fixtures";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { LogisticsBoard } from "./LogisticsBoard";

it("switches between tasks and packing with an accessible segmented tab control", async () => {
  server.use(
    http.get("*/api/trips/:id/tasks", () => HttpResponse.json([])),
    http.get("*/api/trips/:id/packing/me", () =>
      HttpResponse.json({ templates_available: [], applied: [], sections: [], progress: { packed: 0, total: 0 } }),
    ),
    http.get("*/api/trips/:id/packing/summary", () => HttpResponse.json([])),
  );
  renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip()}>
        <LogisticsBoard tripId="t1" />
      </TripProvider>
    </MeProvider>,
  );

  const tasks = screen.getByRole("tab", { name: "Tareas" });
  const packing = screen.getByRole("tab", { name: "Valija" });
  expect(tasks).toHaveAttribute("aria-selected", "true");
  expect(packing).toHaveAttribute("aria-selected", "false");
  expect(screen.getByRole("tablist")).toHaveClass("ui-segmented");

  fireEvent.click(packing);
  expect(packing).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "tab-packing");
  await screen.findByText("Arrancá con una lista armada");
});

it("opens with the packing photo banner and the section title as its heading", async () => {
  server.use(
    http.get("*/api/trips/:id/tasks", () => HttpResponse.json([])),
  );
  const { container } = renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip()}>
        <LogisticsBoard tripId="t1" />
      </TripProvider>
    </MeProvider>,
  );

  expect(screen.getByRole("heading", { level: 2, name: "Logística" })).toBeInTheDocument();
  expect(container.querySelector(".section-banner-media img")).toHaveAttribute("data-photo", "packing");
  expect(container.querySelector(".section-banner-media img")).toHaveAttribute("alt", "");
  expect(container.querySelector(".section-banner-media")).toHaveAttribute("aria-hidden", "true");
});
