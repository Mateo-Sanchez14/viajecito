import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { makeMe } from "@/features/trips/fixtures";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { useProposal } from "../hooks/queries";
import { makeProposal, makeTally, PROPOSAL_ID } from "../test/handlers";
import { VoteButtons } from "./VoteButtons";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));
const t = messages.proposals;
const label = (name: string, count: number) =>
  t.vote.aria.replace("{label}", name).replace(/\{count, plural.*\}/, `${count} ${count === 1 ? "voto" : "votos"}`);

/** Feeds the buttons from the query cache, like the detail page does, so optimistic updates show. */
function Harness({ disabled = false }: { disabled?: boolean }) {
  const { data } = useProposal(PROPOSAL_ID);
  return data ? <VoteButtons proposalId={data.id} tally={data.tally} disabled={disabled} /> : null;
}

/** What the fake api currently holds: refetches after a mutation read this, like the real one. */
let serverTally = makeTally();

function setup(tally = makeTally({ up: 2, neutral: 0, down: 1, score: 1, my_vote: null }), disabled = false) {
  serverTally = tally;
  server.use(
    http.get("/api/proposals/{proposal_id}", ({ response }) => response(200).json(makeProposal({ tally: serverTally }))),
  );
  return renderWithProviders(
    <MeProvider me={makeMe()}>
      <Harness disabled={disabled} />
    </MeProvider>,
  );
}

const up = () => screen.findByRole("button", { name: label(t.vote.up, 2) });
const pressed = (button: HTMLElement) => button.getAttribute("aria-pressed");

describe("VoteButtons", () => {
  afterEach(() => resetCsrfToken());

  it("shows the three options with their counts and marks my vote as pressed", async () => {
    setup(makeTally({ up: 2, neutral: 1, down: 0, score: 2, my_vote: 0 }));

    expect(await screen.findByRole("button", { name: label(t.vote.up, 2) })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: label(t.vote.neutral, 1) })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: label(t.vote.down, 0) })).toHaveAttribute("aria-pressed", "false");
  });

  it("updates the tally optimistically, before the api answers", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      csrf,
      http.put("/api/proposals/{proposal_id}/vote", async () => {
        await gate;
        serverTally = makeTally({ up: 3, neutral: 0, down: 1, score: 2, my_vote: 1 });
        return HttpResponse.json(serverTally);
      }),
    );
    setup();

    fireEvent.click(await up());

    const after = await screen.findByRole("button", { name: label(t.vote.up, 3) });
    expect(pressed(after)).toBe("true");
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: label(t.vote.up, 3) })).toBeEnabled());
  });

  it("rolls back and shows an error when the api fails", async () => {
    server.use(
      csrf,
      http.put("/api/proposals/{proposal_id}/vote", () =>
        HttpResponse.json({ code: "boom", message: "x" }, { status: 500 }),
      ),
    );
    setup();

    fireEvent.click(await up());

    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.unexpected.title);
    const rolledBack = await screen.findByRole("button", { name: label(t.vote.up, 2) });
    expect(pressed(rolledBack)).toBe("false");
  });

  it("says why when the proposal is closed (409 proposal_closed)", async () => {
    server.use(
      csrf,
      http.put("/api/proposals/{proposal_id}/vote", ({ response }) =>
        response(409).json({ code: "proposal_closed", message: "x" }),
      ),
    );
    setup();

    fireEvent.click(await up());

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.proposal_closed);
  });

  it("removes my vote when I press my current choice again", async () => {
    let deleted = false;
    server.use(
      csrf,
      http.delete("/api/proposals/{proposal_id}/vote", ({ response }) => {
        deleted = true;
        serverTally = makeTally({ up: 1, neutral: 0, down: 1, score: 0, my_vote: null });
        return response(200).json(serverTally);
      }),
    );
    setup(makeTally({ up: 2, neutral: 0, down: 1, score: 1, my_vote: 1 }));

    const pressedUp = await screen.findByRole("button", { name: label(t.vote.up, 2) });
    expect(pressed(pressedUp)).toBe("true");
    fireEvent.click(pressedUp);

    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByRole("button", { name: label(t.vote.up, 1) })).toHaveAttribute("aria-pressed", "false");
  });

  it("is disabled for a closed proposal", async () => {
    setup(undefined, true);

    expect(await up()).toBeDisabled();
  });

  it("makes every button at least 44px tall", async () => {
    setup();

    expect((await up()).className).toContain("min-h-11");
  });
});

