import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import {
  makeEntry,
  makeItinerary,
  itineraryHandler,
  csrfHandler,
} from "../test/handlers";
import { ItineraryPlanner } from "./ItineraryPlanner";
it("shows days, unscheduled tray and preserved out-of-range entries", async () => {
  server.use(
    itineraryHandler(
      makeItinerary({
        out_of_range: [makeEntry({ id: "old", title: "Old date" })],
      }),
    ),
  );
  renderWithProviders(<ItineraryPlanner tripId="trip" />);
  expect(await screen.findByText("Try the cafe")).toBeVisible();
  expect(screen.getByText("Old date")).toBeVisible();
  expect(screen.getByText("Bring water")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Subir Try the cafe" }),
  ).toBeVisible();
});
it("validates entries and sends local time/day without UTC conversion", async () => {
  let body: unknown;
  server.use(
    itineraryHandler(),
    csrfHandler,
    http.post("*/api/trips/trip/itinerary/entries", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(makeEntry({ title: "New plan" }), {
        status: 201,
      });
    }),
  );
  renderWithProviders(<ItineraryPlanner tripId="trip" />);
  await screen.findByText("Try the cafe");
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  const form = screen.getByRole("form", { name: "Agregar actividad" });
  fireEvent.change(within(form).getByLabelText("Título"), {
    target: { value: "New plan" },
  });
  fireEvent.change(within(form).getByLabelText("Hora"), {
    target: { value: "09:00" },
  });
  fireEvent.submit(form);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Revisá los horarios",
  );
  fireEvent.change(within(form).getByLabelText("Día"), {
    target: { value: "2026-10-01" },
  });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(body).toMatchObject({
      title: "New plan",
      day_date: "2026-10-01",
      start_time: "09:00",
    }),
  );
});
it("reorders optimistically and rolls back on rejection", async () => {
  const value = makeItinerary({
    days: [],
    tray: [
      makeEntry({
        id: "a",
        title: "First",
        starts_at: null,
        day_date: null,
        position: 0,
      }),
      makeEntry({
        id: "b",
        title: "Second",
        starts_at: null,
        day_date: null,
        position: 1,
      }),
    ],
  });
  let resolve!: () => void;
  const gate = new Promise<void>((done) => {
    resolve = done;
  });
  server.use(
    itineraryHandler(value),
    csrfHandler,
    http.post("*/api/itinerary_entries/b/move", async () => {
      await gate;
      return HttpResponse.json(
        { code: "at_edge", message: "No" },
        { status: 409 },
      );
    }),
  );
  renderWithProviders(<ItineraryPlanner tripId="trip" />);
  await screen.findByText("Second");
  fireEvent.click(screen.getByRole("button", { name: "Subir Second" }));
  await waitFor(() =>
    expect(
      within(screen.getByRole("list", { name: "Sin día" })).getAllByRole(
        "listitem",
      )[0],
    ).toHaveTextContent("Second"),
  );
  resolve();
  await waitFor(() =>
    expect(
      within(screen.getByRole("list", { name: "Sin día" })).getAllByRole(
        "listitem",
      )[0],
    ).toHaveTextContent("First"),
  );
  expect(await screen.findByRole("alert")).not.toHaveTextContent("API error");
});

it("clears local times when returning a scheduled entry to the tray", async () => {
  let body: unknown;
  server.use(
    itineraryHandler(),
    csrfHandler,
    http.patch("*/api/itinerary_entries/entry", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(
        makeEntry({ day_date: null, starts_at: null, start_time: null }),
      );
    }),
  );
  renderWithProviders(<ItineraryPlanner tripId="trip" />);
  await screen.findByText("Try the cafe");
  fireEvent.click(
    screen.getByRole("button", { name: "Editar Meet at the base" }),
  );
  const form = screen.getByRole("form", { name: "Editar actividad" });
  fireEvent.change(within(form).getByLabelText("Día"), {
    target: { value: "" },
  });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(body).toMatchObject({
      day_date: null,
      start_time: null,
      end_time: null,
    }),
  );
});

it("saves day title/notes and deletes an entry", async () => {
  let dayBody: unknown;
  let deleted = false;
  server.use(
    itineraryHandler(),
    csrfHandler,
    http.put(
      "*/api/trips/trip/itinerary/days/2026-10-01",
      async ({ request }) => {
        dayBody = await request.json();
        return HttpResponse.json(makeItinerary().days[0]);
      },
    ),
    http.delete("*/api/itinerary_entries/tray", () => {
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(<ItineraryPlanner tripId="trip" />);
  await screen.findByText("Try the cafe");
  fireEvent.click(screen.getByRole("button", { name: "Editar día" }));
  fireEvent.change(screen.getByLabelText("Título del día"), {
    target: { value: "Transfer" },
  });
  fireEvent.change(screen.getByLabelText("Notas del día"), {
    target: { value: "Pack early" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar día" }));
  await waitFor(() =>
    expect(dayBody).toEqual({ title: "Transfer", notes: "Pack early" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Eliminar Try the cafe" }),
  );
  await waitFor(() => expect(deleted).toBe(true));
});
it("opens the entry editor as an accessible modal sheet", async () => {
  server.use(itineraryHandler());
  renderWithProviders(<ItineraryPlanner tripId="trip" />);
  await screen.findByText("Try the cafe");
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  const sheet = screen.getByRole("dialog", { name: "Agregar actividad" });
  expect(sheet).toHaveAttribute("open");
  fireEvent.click(within(sheet).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("shows an illustrated empty state when there is nothing planned at all", async () => {
  server.use(itineraryHandler(makeItinerary({ days: [], tray: [], out_of_range: [] })));
  const { container } = renderWithProviders(<ItineraryPlanner tripId="trip" />);
  expect(
    await screen.findByText(
      "Armá el día a día o elegí propuestas para llenar la bandeja",
    ),
  ).toBeVisible();
  expect(container.querySelector("svg[data-scene='map']")).toHaveAttribute("aria-hidden", "true");
});
