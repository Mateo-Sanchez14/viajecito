import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { makeSummary } from "@/features/proposals/test/handlers";
import { server } from "@/test/server";
import { useMapProposals, mapProposalKey } from "./useMapProposals";
afterEach(() => vi.useRealTimers());
it("uses the contract key and polls the list every60seconds with no extra filters", async () => {
  const urls: string[] = [];
  server.use(
    http.get("*/api/trips/trip/proposals", ({ request }) => {
      urls.push(request.url);
      return HttpResponse.json([makeSummary()]);
    }),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() => useMapProposals("trip"), {
    wrapper,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(result.current.data).toHaveLength(1);
  expect(mapProposalKey("trip")).toEqual([
    "proposals",
    "trip",
    "list",
    { map: true },
  ]);
  expect(new URL(urls[0]).search).toBe("");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_100);
  });
  expect(urls).toHaveLength(2);
  unmount();
  cache.clear();
});
