import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { useToday, TODAY_INTERVAL } from "./useToday";

const snapshot = {
  mode: "undated",
  local_date: "2026-10-01",
  local_time: "10:00",
  timezone: "America/Argentina/Buenos_Aires",
  countdown_days: null,
  day: null,
  now_entry: null,
  next_entry: null,
  next_meeting_point: null,
  pinned_notes: [],
  recent_notes: [],
  generated_at: "2026-10-01T13:00:00Z",
};
afterEach(() => vi.useRealTimers());
it("polls every twenty seconds and retains the last snapshot on 304", async () => {
  const seen: (string | null)[] = [];
  server.use(
    http.get("*/api/trips/trip/today", ({ request }) => {
      seen.push(request.headers.get("If-None-Match"));
      return seen.length === 1
        ? HttpResponse.json(snapshot, { headers: { ETag: 'W/"one"' } })
        : new HttpResponse(null, { status: 304, headers: { ETag: 'W/"one"' } });
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() => useToday("trip"), { wrapper });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(result.current.data?.mode).toBe("undated");
  await act(async () => {
    await result.current.refetch();
  });
  expect(seen).toEqual([null, 'W/"one"']);
  expect(result.current.data).toEqual(snapshot);
  expect(result.current.isError).toBe(false);
  expect(TODAY_INTERVAL).toBe(20_000);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_100);
  });
  expect(seen.length).toBeGreaterThanOrEqual(3);
  unmount();
  client.clear();
});
