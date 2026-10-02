import { expect, it, vi } from "vitest";
const gate = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/server/requireMe", () => ({ requireMe: gate }));
import MapPage from "@/app/(app)/crews/[crewId]/trips/[tripId]/map/page";
it("authenticates its page segment before any client map data is rendered", async () => {
  gate.mockRejectedValueOnce(new Error("redirect"));
  await expect(
    MapPage({ params: Promise.resolve({ crewId: "crew", tripId: "trip" }) }),
  ).rejects.toThrow("redirect");
  gate.mockResolvedValueOnce({});
  const page = await MapPage({
    params: Promise.resolve({ crewId: "crew", tripId: "trip" }),
  });
  expect(page.props).toEqual({ tripId: "trip", crewId: "crew" });
});
