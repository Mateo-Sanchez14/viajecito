import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider } from "@/features/trips/TripProvider";
import { makeTrip, makeMe, TRIP_ID } from "@/features/trips/fixtures";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import {
  csrfHandler,
  makeToday,
  notesHandler,
  makeNote,
} from "@/features/itinerary/test/handlers";
import { todayHandler, documentsHandler, snowHandler } from "../test/handlers";
import { TodayView } from "./TodayView";
function setup(modules = ["today", "documents", "ski"]) {
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip({ modules })}>
        <TodayView tripId={TRIP_ID} crewId="crew" />
      </TripProvider>
    </MeProvider>,
  );
}
it.each([
  ["undated", "Todavía no hay fechas"],
  ["before", "Faltan 3 días"],
  ["after", "El viaje terminó"],
] as const)("renders %s mode", async (mode, label) => {
  server.use(
    todayHandler(makeToday({ mode, countdown_days: 3, day: null })),
    notesHandler(),
  );
  setup(["today"]);
  expect(await screen.findByText(label)).toBeVisible();
});
it("shows timeline, meeting point, protected document downloads and snow", async () => {
  server.use(todayHandler(), notesHandler(), documentsHandler, snowHandler);
  setup();
  expect(
    await screen.findByRole("link", { name: "Flight ticket" }),
  ).toHaveAttribute("href", "/api/documents/ticket/file");
  expect(await screen.findByText("Dato de hace 8 h")).toBeVisible();
  expect(screen.getByRole("link", { name: "Ver mapa" })).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/?mlat=-41&mlon=-71",
  );
  expect(screen.getByRole("list", { name: "Plan de hoy" })).toBeVisible();
  expect(screen.getByText("Después")).toBeVisible();
});
it("does not fetch or show documents/snow without their modules", async () => {
  server.use(todayHandler(), notesHandler());
  setup(["today"]);
  await screen.findByRole("list", { name: "Plan de hoy" });
  expect(screen.queryByText("Documentos a mano")).not.toBeInTheDocument();
  expect(screen.queryByText("Nieve")).not.toBeInTheDocument();
});
it("adds, pins and deletes quick notes", async () => {
  let body: unknown;
  let pinned: unknown;
  let removed = false;
  server.use(
    todayHandler(),
    notesHandler([makeNote()]),
    csrfHandler,
    http.post("*/api/trips/:tripId/notes", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(makeNote(), { status: 201 });
    }),
    http.patch("*/api/notes/note", async ({ request }) => {
      pinned = await request.json();
      return HttpResponse.json(makeNote({ pinned: true }));
    }),
    http.delete("*/api/notes/note", () => {
      removed = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  setup(["today"]);
  await screen.findByText("Bring tickets");
  fireEvent.change(screen.getByLabelText("Anotá algo rápido…"), {
    target: { value: "Water" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar nota" }));
  await waitFor(() => expect(body).toEqual({ body: "Water", pinned: false }));
  fireEvent.click(screen.getByRole("button", { name: "Fijar" }));
  await waitFor(() => expect(pinned).toEqual({ pinned: true }));
  fireEvent.click(screen.getByRole("button", { name: "Eliminar nota" }));
  await waitFor(() => expect(removed).toBe(true));
});

it("retains its snapshot and announces offline status politely", async () => {
  server.use(todayHandler(), notesHandler());
  setup(["today"]);
  await screen.findByRole("list", { name: "Plan de hoy" });
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: false,
  });
  fireEvent(window, new Event("offline"));
  const status = screen.getByText(
    "Sin conexión: mostrando lo último que bajamos",
  );
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(screen.getByRole("list", { name: "Plan de hoy" })).toBeVisible();
  if (descriptor) Object.defineProperty(navigator, "onLine", descriptor);
  else Reflect.deleteProperty(navigator, "onLine");
  fireEvent(window, new Event("online"));
});

it("maps the pinned-note cap error without showing the developer message", async () => {
  server.use(
    todayHandler(),
    notesHandler([makeNote()]),
    csrfHandler,
    http.patch("*/api/notes/note", () =>
      HttpResponse.json(
        { code: "too_many_pinned", message: "Developer detail" },
        { status: 409 },
      ),
    ),
  );
  setup(["today"]);
  await screen.findByText("Bring tickets");
  fireEvent.click(screen.getByRole("button", { name: "Fijar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Ya hay 5 notas fijadas",
  );
  expect(screen.queryByText("Developer detail")).not.toBeInTheDocument();
});
