// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRIP_ID, makeTrip } from "@/features/trips/fixtures";

const loadTrip = vi.fn();
vi.mock("@/features/trips/server/loadTrip", () => ({
  loadTrip: (...args: unknown[]) => loadTrip(...args),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ModulePlaceholderPage from "./page";

const props = (module: string) => ({ params: Promise.resolve({ tripId: TRIP_ID, module }) });

describe("[module] placeholder page", () => {
  beforeEach(() => loadTrip.mockReset());

  it("renders the placeholder for a module of the trip", async () => {
    loadTrip.mockResolvedValue(makeTrip({ modules: ["budget"] }));

    const element = await ModulePlaceholderPage(props("budget"));

    expect(loadTrip).toHaveBeenCalledWith(TRIP_ID);
    expect(element.props.moduleKey).toBe("budget");
  });

  it("is a 404 for a section the trip does not have", async () => {
    loadTrip.mockResolvedValue(makeTrip({ modules: ["budget"] }));

    await expect(ModulePlaceholderPage(props("ski"))).rejects.toThrow("NOT_FOUND");
  });

  it("is a 404 when the trip cannot be loaded", async () => {
    loadTrip.mockResolvedValue(null);

    await expect(ModulePlaceholderPage(props("budget"))).rejects.toThrow("NOT_FOUND");
  });
});
