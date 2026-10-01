import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { NextIntlClientProvider } from "next-intl";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { CREW_ID, TRIP_ID, makeMe, makeTrip } from "@/features/trips/fixtures";
import { TripProvider } from "@/features/trips/TripProvider";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { proposalKeys, DEFAULT_FILTERS, type ProposalSummary, type ProposalsSummary } from "../api/proposals";
import { makeSummary, makeTally } from "../test/handlers";
import { ProposalBoard } from "./ProposalBoard";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));
const t = messages.proposals;

const item = makeSummary({ tally: makeTally({ up: 2, neutral: 0, down: 1, score: 1, my_vote: null }) });

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData<ProposalSummary[]>(proposalKeys.list(TRIP_ID, DEFAULT_FILTERS), [item]);
  queryClient.setQueryData<ProposalsSummary>(proposalKeys.summary(TRIP_ID), { counts: { proposed: 1 }, top: [item] });
  render(
    <NextIntlClientProvider locale="es-AR" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <MeProvider me={makeMe()}>
          <TripProvider trip={makeTrip()}>
            <ProposalBoard tripId={TRIP_ID} crewId={CREW_ID} />
          </TripProvider>
        </MeProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return queryClient;
}

const listTally = (queryClient: QueryClient) =>
  queryClient.getQueryData<ProposalSummary[]>(proposalKeys.list(TRIP_ID, DEFAULT_FILTERS))![0].tally;
const summaryTally = (queryClient: QueryClient) =>
  queryClient.getQueryData<ProposalsSummary>(proposalKeys.summary(TRIP_ID))!.top[0].tally;

describe("a vote from the board", () => {
  afterEach(() => resetCsrfToken());

  it("updates the list and summary caches at once and restores both when the api fails", async () => {
    let failPut: () => void = () => {};
    const gate = new Promise<void>((resolve) => (failPut = resolve));
    server.use(
      csrf,
      http.put("/api/proposals/{proposal_id}/vote", async () => {
        await gate;
        return HttpResponse.json({ code: "boom", message: "x" }, { status: 500 });
      }),
      // Refetches after the failure are held forever: only the rollback may restore the caches.
      http.get("/api/trips/{trip_id}/proposals", () => new Promise<never>(() => {})),
    );
    const queryClient = setup();

    fireEvent.click(await screen.findByRole("button", { name: /Me copa: 2 votos/ }));

    await waitFor(() => expect(listTally(queryClient)).toMatchObject({ up: 3, score: 2, my_vote: 1 }));
    expect(summaryTally(queryClient)).toMatchObject({ up: 3, score: 2, my_vote: 1 });
    expect(screen.getByText(t.vote.count.replace("{up}", "3").replace("{down}", "1"))).toBeInTheDocument();

    failPut();

    await waitFor(() => expect(listTally(queryClient)).toMatchObject({ up: 2, score: 1, my_vote: null }));
    expect(summaryTally(queryClient)).toMatchObject({ up: 2, score: 1, my_vote: null });
  });
});
