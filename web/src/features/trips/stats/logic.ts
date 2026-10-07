import type { Participant } from "../api/trips";

/** What one stat card shows; the components turn it into copy. `progress` is always 0..1, never NaN. */
export type StatFigures = {
  value: number;
  total: number;
  progress: number;
};

const fraction = (part: number, total: number) => (total > 0 ? part / total : 0);

/** Who is going: participants that answered "in" out of everyone invited. */
export function peopleStat(participants: Pick<Participant, "rsvp">[]): StatFigures {
  const total = participants.length;
  const value = participants.filter((participant) => participant.rsvp === "in").length;
  return { value, total, progress: fraction(value, total) };
}

/** Proposals decided (chosen or booked) out of those still alive; discarded ones do not count. */
export function proposalsStat(counts: Record<string, number>): StatFigures & { open: number } {
  const count = (status: string) => counts[status] ?? 0;
  const value = count("chosen") + count("booked");
  const open = count("proposed") + count("discussing");
  const total = value + open;
  return { value, total, open, progress: fraction(value, total) };
}

/** Tasks done out of all tasks, plus how many open ones are overdue. */
export function tasksStat(tasks: { status: string; overdue: boolean }[]): StatFigures & { overdue: number } {
  const total = tasks.length;
  const value = tasks.filter((task) => task.status === "done").length;
  const overdue = tasks.filter((task) => task.status !== "done" && task.overdue).length;
  return { value, total, overdue, progress: fraction(value, total) };
}

/** My packing progress: my entry of the crew summary, or `null` when I am not in it. */
export function packingStat(
  summary: { person: { person_id: string }; packed: number; total: number }[],
  personId: string,
): StatFigures | null {
  const mine = summary.find((entry) => entry.person.person_id === personId);
  if (!mine) return null;
  return { value: mine.packed, total: mine.total, progress: fraction(mine.packed, mine.total) };
}
