import { expect, it, vi } from "vitest";
const gate = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/server/requireMe", () => ({ requireMe: gate }));
import ItineraryPage from "@/app/(app)/crews/[crewId]/trips/[tripId]/itinerary/page";
import TodayPage from "@/app/(app)/crews/[crewId]/trips/[tripId]/today/page";
it.each([ItineraryPage, TodayPage])(
  "gates the page segment before rendering client data",
  async (Page) => {
    gate.mockRejectedValueOnce(new Error("redirect"));
    await expect(
      Page({ params: Promise.resolve({ crewId: "crew", tripId: "trip" }) }),
    ).rejects.toThrow("redirect");
    gate.mockResolvedValueOnce({});
    const rendered = await Page({
      params: Promise.resolve({ crewId: "crew", tripId: "trip" }),
    });
    expect(rendered.props.tripId).toBe("trip");
  },
);
