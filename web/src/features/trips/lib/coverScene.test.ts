import { describe, expect, it } from "vitest";
import { coverScene } from "./coverScene";

const SCENES = ["road", "beach", "snow", "city"];

describe("coverScene", () => {
  it("maps ski trips to the snow scene whatever the id", () => {
    expect(coverScene({ id: "a", type: "ski" })).toBe("snow");
    expect(coverScene({ id: "b", type: "ski" })).toBe("snow");
  });

  it("is deterministic for the same trip", () => {
    const trip = { id: "22222222-2222-4222-8222-222222222222", type: "generic" };

    expect(coverScene(trip)).toBe(coverScene({ ...trip }));
  });

  it("falls back to a known non-snow scene for unregistered types", () => {
    for (const type of ["generic", "mystery", ""]) {
      const scene = coverScene({ id: "33333333-3333-4333-8333-333333333333", type });
      expect(SCENES).toContain(scene);
      expect(scene).not.toBe("snow");
    }
  });

  it("spreads different ids over the default scenes", () => {
    const ids = Array.from({ length: 60 }, (_, index) => `trip-${index}`);
    const scenes = new Set(ids.map((id) => coverScene({ id, type: "generic" })));

    expect(scenes).toEqual(new Set(["road", "city", "beach"]));
  });
});
