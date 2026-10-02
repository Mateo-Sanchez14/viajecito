import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MeProvider } from "@/features/auth/MeProvider";
import { TripProvider } from "@/features/trips/TripProvider";
import { makeMe, makeTrip, TRIP_ID } from "@/features/trips/fixtures";
import { renderWithProviders } from "@/test/render";
import type { Task } from "../api/logistics";
import { TaskForm } from "./TaskForm";

it("offers reopening but not the invalid done-to-blocked transition", () => {
  const task: Task = {
    id: "task1", trip_id: TRIP_ID, number: 1, kind: "todo", title: "Book car",
    notes: "", owner: null, due_on: null, status: "done", quantity: null,
    proposal_id: null, source: "manual", nudge_count: 0, done_at: "2026-10-01",
    done_by: null, overdue: false, created_at: "2026-10-01", updated_at: "2026-10-01",
  };
  renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={makeTrip()}>
        <TaskForm tripId={TRIP_ID} task={task} onSaved={() => {}} />
      </TripProvider>
    </MeProvider>,
  );
  expect(screen.getByLabelText("Estado")).toHaveValue("done");
  expect(screen.getByRole("option", { name: "Abierta" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Trabada" })).not.toBeInTheDocument();
});
