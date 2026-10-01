import type { PersonRef, Proposal, ProposalSummary, VoteTally, VoteValue } from "../api/proposals";

const BUCKET = { 1: "up", 0: "neutral", [-1]: "down" } as const;

/**
 * The tally after I change my vote to `next` (`null` removes it). `majority` is kept as the
 * server sent it: it depends on RSVPs the client cannot recompute, and the refetch fixes it.
 */
export function applyVote(tally: VoteTally, next: VoteValue | null): VoteTally {
  const counts = { up: tally.up, neutral: tally.neutral, down: tally.down };
  if (tally.my_vote !== null) counts[BUCKET[tally.my_vote]] -= 1;
  if (next !== null) counts[BUCKET[next]] += 1;
  return { ...tally, ...counts, score: counts.up - counts.down, my_vote: next };
}

export function summaryWithVote<T extends ProposalSummary>(proposal: T, next: VoteValue | null): T {
  return { ...proposal, tally: applyVote(proposal.tally, next) };
}

/** Same for the detail payload, which also lists who voted what. */
export function proposalWithVote(proposal: Proposal, next: VoteValue | null, me: PersonRef): Proposal {
  const others = proposal.votes.filter((vote) => vote.person.person_id !== me.person_id);
  return {
    ...summaryWithVote(proposal, next),
    votes: next === null ? others : [...others, { person: me, value: next }],
  };
}
