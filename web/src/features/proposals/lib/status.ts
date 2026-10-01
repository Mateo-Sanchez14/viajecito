import type { ProposalStatus } from "../api/proposals";

const RANK: Record<Exclude<ProposalStatus, "discarded">, number> = {
  proposed: 0,
  discussing: 1,
  chosen: 2,
  booked: 3,
};

/** A move back along proposed < discussing < chosen < booked (discarding and reopening a discarded one are not). */
export function isBackwards(from: ProposalStatus, to: ProposalStatus): boolean {
  if (from === "discarded" || to === "discarded") return false;
  return RANK[to] < RANK[from];
}

/** Discarding and backwards moves ask for confirmation before they are sent. */
export function needsConfirm(from: ProposalStatus, to: ProposalStatus): boolean {
  return to === "discarded" || isBackwards(from, to);
}

export type TransitionLabelKey = ProposalStatus | "reopen" | "unbook";

/** Key under `proposals.transition.*` for the button that moves `from` to `to`. */
export function transitionLabelKey(from: ProposalStatus, to: ProposalStatus): TransitionLabelKey {
  if (from === "booked" && to === "chosen") return "unbook";
  if (from === "chosen" && to === "discussing") return "reopen";
  return to;
}
