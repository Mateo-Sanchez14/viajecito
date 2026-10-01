import { describe, expect, it } from "vitest";
import { makeProposal, makeSummary, makeTally } from "../test/handlers";
import { applyVote, summaryWithVote, proposalWithVote } from "./tally";

describe("applyVote", () => {
  it("adds a first vote", () => {
    expect(applyVote(makeTally({ up: 2, neutral: 0, down: 1, score: 1, my_vote: null }), 1)).toMatchObject({
      up: 3,
      neutral: 0,
      down: 1,
      score: 2,
      my_vote: 1,
    });
  });

  it("moves a vote from one bucket to another", () => {
    expect(applyVote(makeTally({ up: 2, neutral: 0, down: 1, score: 1, my_vote: 1 }), -1)).toMatchObject({
      up: 1,
      down: 2,
      score: -1,
      my_vote: -1,
    });
  });

  it("removes a vote", () => {
    expect(applyVote(makeTally({ up: 1, neutral: 1, down: 0, score: 1, my_vote: 0 }), null)).toMatchObject({
      up: 1,
      neutral: 0,
      down: 0,
      score: 1,
      my_vote: null,
    });
  });

  it("keeps the server's majority flag (it depends on RSVPs the client cannot recompute)", () => {
    expect(applyVote(makeTally({ majority: true }), 0).majority).toBe(true);
  });
});

describe("proposalWithVote", () => {
  const me = { person_id: "p-me", display_name: "Mateo" };

  it("replaces my entry in the votes list and updates the tally", () => {
    const proposal = makeProposal({
      tally: makeTally({ up: 1, neutral: 0, down: 0, score: 1, my_vote: 1 }),
      votes: [{ person: me, value: 1 }],
    });

    const next = proposalWithVote(proposal, -1, me);

    expect(next.votes).toEqual([{ person: me, value: -1 }]);
    expect(next.tally).toMatchObject({ up: 0, down: 1, my_vote: -1 });
  });

  it("drops my entry when the vote is removed and appends it when new", () => {
    const other = { person_id: "p-2", display_name: "Lucia" };
    const withOther = makeProposal({ tally: makeTally({ my_vote: null }), votes: [{ person: other, value: 1 }] });

    expect(proposalWithVote(withOther, 1, me).votes).toEqual([
      { person: other, value: 1 },
      { person: me, value: 1 },
    ]);
    expect(proposalWithVote(proposalWithVote(withOther, 1, me), null, me).votes).toEqual([
      { person: other, value: 1 },
    ]);
  });
});

describe("summaryWithVote", () => {
  it("updates only the tally", () => {
    const summary = makeSummary({ tally: makeTally({ up: 0, neutral: 0, down: 0, score: 0, my_vote: null }) });

    expect(summaryWithVote(summary, 1).tally).toMatchObject({ up: 1, score: 1, my_vote: 1 });
    expect(summaryWithVote(summary, 1).title).toBe(summary.title);
  });
});
