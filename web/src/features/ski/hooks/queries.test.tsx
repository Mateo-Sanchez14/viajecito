import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TRIP_ID } from "@/features/trips/fixtures";
import { server } from "@/test/server";
import { skiKeys } from "../api/ski";
import { skiConditionsHandler } from "../test/handlers";
import { useSkiConditions } from "./queries";

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("ski query keys and hooks", () => {
  it("uses the keys the contract names", () => {
    expect(skiKeys.overview("t1")).toEqual(["ski", "t1"]);
    expect(skiKeys.conditions("t1")).toEqual(["ski", "t1", "conditions"]);
    expect(skiKeys.resorts()).toEqual(["ski", "resorts", "all"]);
    expect(skiKeys.resorts("AR")).toEqual(["ski", "resorts", "AR"]);
    expect(skiKeys.profile()).toEqual(["ski", "profile", "me"]);
  });

  it("reads the cheap conditions endpoint under its shared key (M4 Today reuses it)", async () => {
    server.use(skiConditionsHandler);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSkiConditions(TRIP_ID), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.data?.resorts).toHaveLength(1));
    expect(queryClient.getQueryData(skiKeys.conditions(TRIP_ID))).toBeDefined();
  });
});
