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
