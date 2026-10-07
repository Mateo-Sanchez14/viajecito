import { daysUntil } from "@/shared/lib/daysUntil";
import type { Participant, Rsvp } from "../api/trips";
import type { ActionItem } from "./types";

/** Documents are only worth a nudge in the month before departure. */
export const DOCUMENTS_WINDOW_DAYS = 30;

type TaskLike = { status: string; overdue: boolean; owner: { person_id: string } | null };

const isOpen = (task: TaskLike) => task.status !== "done";
const overdueTasks = (tasks: TaskLike[]) => tasks.filter((task) => isOpen(task) && task.overdue);

/** My own answer is still "pending". */
export function rsvpMine(myRsvp: Rsvp): ActionItem | null {
  return myRsvp === "pending" ? { messageKey: "rsvpMine", target: "rsvp", tone: "accent" } : null;
}

/** Other people who have not answered yet (me excluded: my own row covers me). */
export function rsvpOthers(participants: Pick<Participant, "person_id" | "rsvp">[], mePersonId: string): ActionItem | null {
  const count = participants.filter((p) => p.rsvp === "pending" && p.person_id !== mePersonId).length;
  return count > 0 ? { messageKey: "rsvpOthers", values: { count }, target: "rsvp", tone: "neutral" } : null;
}

/** No departure day yet; if a dates vote is already open the row says to vote instead of to decide. */
export function datesAction(startOn: string | null, decisions: { status: string }[]): ActionItem | null {
  if (startOn) return null;
  const voting = decisions.some((decision) => decision.status === "open");
  return { messageKey: voting ? "datesVote" : "datesUndecided", target: "dates", tone: "accent" };
}

/** Chosen or booked proposals the budget cannot count because they have no price. */
export function missingPrice(missing: readonly unknown[]): ActionItem | null {
  return missing.length > 0
    ? { messageKey: "missingPrice", values: { count: missing.length }, target: "budget", tone: "warn" }
    : null;
}

/** Open tasks whose due day has passed (the api decides it in the trip time zone; due today is not overdue). */
export function tasksOverdue(tasks: TaskLike[]): ActionItem | null {
  const count = overdueTasks(tasks).length;
  return count > 0 ? { messageKey: "tasksOverdue", values: { count }, target: "logistics", tone: "warn" } : null;
}

/** My open tasks. Overdue ones take precedence: while any is overdue only that row speaks. */
export function tasksMine(tasks: TaskLike[], mePersonId: string): ActionItem | null {
  if (overdueTasks(tasks).length > 0) return null;
  const count = tasks.filter((task) => isOpen(task) && task.owner?.person_id === mePersonId).length;
  return count > 0 ? { messageKey: "tasksMine", values: { count }, target: "logistics", tone: "accent" } : null;
}

/** No documents yet and the trip leaves within the next month (in the trip time zone). */
export function documentsNone(
  documentCount: number,
  startOn: string | null,
  timeZone: string,
  now: Date,
): ActionItem | null {
  if (documentCount > 0 || !startOn) return null;
  const days = daysUntil(startOn, timeZone, now);
  return days >= 0 && days <= DOCUMENTS_WINDOW_DAYS
    ? { messageKey: "documentsNone", target: "documents", tone: "neutral" }
    : null;
}

/** A dated trip whose itinerary has no entry anywhere: days, tray or out of range. */
export function itineraryEmpty(
  itinerary: { days: { entries: unknown[] }[]; tray: unknown[]; out_of_range: unknown[] },
  startOn: string | null,
): ActionItem | null {
  if (!startOn) return null;
  const entries =
    itinerary.days.reduce((total, day) => total + day.entries.length, 0) +
    itinerary.tray.length +
    itinerary.out_of_range.length;
  return entries === 0 ? { messageKey: "itineraryEmpty", target: "itinerary", tone: "neutral" } : null;
}
