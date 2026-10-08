import { describe, expect, it } from "vitest";
import { SPOT_PAD, placeCard } from "./placement";

const CARD = { width: 288, height: 180 };

describe("placeCard", () => {
  it("goes below a target in the upper half, a gap under its padded box", () => {
    const place = placeCard({ x: 40, y: 100, width: 200, height: 60 }, { width: 1280, height: 800 }, CARD);

    expect(place.side).toBe("below");
    expect(place.y).toBe(100 + 60 + SPOT_PAD + 16);
  });

  it("goes above a target in the lower half when there is room", () => {
    const place = placeCard({ x: 40, y: 600, width: 200, height: 60 }, { width: 1280, height: 800 }, CARD);

    expect(place.side).toBe("above");
    expect(place.y).toBe(600 - SPOT_PAD - 16 - CARD.height);
  });

  it("goes below a lower-half target when above does not fit", () => {
    const place = placeCard({ x: 40, y: 300, width: 200, height: 60 }, { width: 800, height: 700 }, { width: 288, height: 330 });

    expect(place.side).toBe("below");
  });

  it("is pinned to the bottom margin, still inside, when neither side fits", () => {
    const place = placeCard({ x: 0, y: 0, width: 390, height: 800 }, { width: 390, height: 844 }, { width: 288, height: 300 });

    expect(place.y).toBe(844 - 16 - 300);
    expect(place.y + 300).toBeLessThanOrEqual(844 - 16);
  });

  it("clamps horizontally so the card stays inside a 320px viewport", () => {
    const left = placeCard({ x: 0, y: 100, width: 40, height: 40 }, { width: 320, height: 640 }, { width: 288, height: 180 });
    const right = placeCard({ x: 280, y: 100, width: 40, height: 40 }, { width: 320, height: 640 }, { width: 288, height: 180 });

    expect(left.x).toBe(16);
    expect(right.x).toBe(16);
    expect(left.x + 288).toBeLessThanOrEqual(320 - 16);
  });

  it("centers the card when there is no target", () => {
    const place = placeCard(null, { width: 1000, height: 800 }, { width: 400, height: 200 });

    expect(place).toEqual({ x: 300, y: 300, side: "center" });
  });

  it("only looks at the part of a tall target that is on screen", () => {
    // Starts above the viewport and ends 40px into it: the card goes below that visible sliver.
    const place = placeCard({ x: 20, y: -600, width: 300, height: 640 }, { width: 390, height: 844 }, CARD);

    expect(place.side).toBe("below");
    expect(place.y).toBe(40 + SPOT_PAD + 16);
  });
});
