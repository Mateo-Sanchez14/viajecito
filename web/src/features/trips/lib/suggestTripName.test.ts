import { describe, expect, it } from "vitest";
import { suggestTripName } from "./suggestTripName";

describe("suggestTripName", () => {
  it("is empty without a destination", () => {
    expect(suggestTripName("", "jul 2027")).toBe("");
    expect(suggestTripName("   ", null)).toBe("");
    expect(suggestTripName(", Río Negro", null)).toBe("");
  });

  it("uses the place before the first comma", () => {
    expect(suggestTripName("Bariloche, Río Negro", null)).toBe("Bariloche");
  });

  it("appends the month and year when there is a start date", () => {
    expect(suggestTripName(" Mendoza ", "jul 2027")).toBe("Mendoza jul 2027");
  });
});
