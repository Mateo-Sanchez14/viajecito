import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider } from "@/features/trips/TripProvider";
import {
  makeMe,
  makeTrip,
  TRIP_ID,
  PERSON_ID,
} from "@/features/trips/fixtures";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { resetCsrfToken } from "@/shared/api/csrf";
import { TaskList } from "./TaskList";
const task = {
  id: "task1",
  trip_id: TRIP_ID,
  number: 1,
  kind: "todo",
  title: "Book car",
  notes: "",
  owner: { person_id: PERSON_ID, display_name: "Mateo" },
  due_on: "2020-01-01",
  status: "open",
  quantity: null,
  proposal_id: null,
  source: "manual",
  nudge_count: 0,
  done_at: null,
  done_by: null,
  overdue: true,
  created_at: "2020-01-01",
  updated_at: "2020-01-01",
};
function setup() {
  renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip()}>
        <TaskList tripId={TRIP_ID} />
      </TripProvider>
    </MeProvider>,
  );
}
afterEach(resetCsrfToken);
it("groups overdue tasks and rolls back a failed optimistic toggle", async () => {
  server.use(
    http.get("*/api/trips/:id/tasks", () => HttpResponse.json([task])),
    http.get("*/api/auth/csrf", () => HttpResponse.json({ csrf_token: "tok" })),
    http.patch("*/api/tasks/:id", () =>
      HttpResponse.json({ code: "invalid_request" }, { status: 400 }),
    ),
  );
  setup();
  const box = await screen.findByRole("checkbox", { name: "Book car" });
  expect(screen.getByRole("heading", { name: "Vencidas" })).toBeInTheDocument();
  fireEvent.click(box);
  await screen.findByRole("alert");
  await waitFor(() => expect(box).not.toBeChecked());
});
it("sends the me owner filter", async () => {
  const owners: string[] = [];
  server.use(
    http.get("*/api/trips/:id/tasks", ({ request }) => {
      owners.push(new URL(request.url).searchParams.get("owner") ?? "");
      return HttpResponse.json([task]);
    }),
  );
  setup();
  await screen.findByText("Book car");
  fireEvent.change(screen.getByLabelText("Mostrar tareas"), {
    target: { value: "me" },
  });
  await waitFor(() => expect(owners).toContain("me"));
});
it("shows a layout-shaped skeleton while loading", () => {
  server.use(http.get("*/api/trips/:id/tasks", () => new Promise(() => {})));
  setup();

  expect(screen.getByRole("status", { name: "Cargando…" })).toBeInTheDocument();
});
it("shows an illustrated empty state whose call to action opens the new task form", async () => {
  server.use(http.get("*/api/trips/:id/tasks", () => HttpResponse.json([])));
  const view = renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip()}>
        <TaskList tripId={TRIP_ID} />
      </TripProvider>
    </MeProvider>,
  );
  await screen.findByText("Todavía no hay tareas");
  expect(view.container.querySelector("svg[data-scene='suitcase']")).toHaveAttribute("aria-hidden", "true");
  // The toolbar button keeps its name; the empty state call to action is a different one.
  expect(screen.getAllByRole("button", { name: "Nueva tarea" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Crear la primera" }));
  expect(await screen.findByRole("heading", { name: "Nueva tarea" })).toBeInTheDocument();
});
it("shows an inline error with a retry when the list fails, then recovers", async () => {
  let calls = 0;
  server.use(
    http.get("*/api/trips/:id/tasks", () => {
      calls += 1;
      return calls === 1 ? HttpResponse.json({ code: "boom" }, { status: 500 }) : HttpResponse.json([task]);
    }),
  );
  setup();
  expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar la lista");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByRole("checkbox", { name: "Book car" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("marks overdue and done tasks with badges and names the row actions after the task", async () => {
  server.use(
    http.get("*/api/trips/:id/tasks", () =>
      HttpResponse.json([task, { ...task, id: "task2", title: "Pack bags", status: "done", overdue: false }]),
    ),
  );
  setup();
  await screen.findByRole("checkbox", { name: "Book car" });
  expect(screen.getByText(/Venció el/)).toBeInTheDocument();
  expect(screen.getByText("Hecha")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Pack bags" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Editar Book car" })).toHaveClass("ui-button-icon");
  expect(screen.getByRole("button", { name: "Eliminar Pack bags" })).toHaveClass("ui-button-icon");
});
