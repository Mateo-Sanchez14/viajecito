import { describe, expect, it } from "vitest";
import { tripCards } from "@/features/trips/cards";
import { DatesOverviewCard } from "./containers/DatesOverviewCard";

describe("dates overview card registration", () => {
  it("registers the card for the dates module at order 20", () => {
    expect(tripCards).toContainEqual({
      key: "dates",
      module: "dates",
      order: 20,
      Component: DatesOverviewCard,
    });
  });
});
