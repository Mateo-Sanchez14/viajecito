import { describe, expect, it } from "vitest";
import { parseCapturePrice } from "./price";

describe("parseCapturePrice", () => {
  it("returns a two-place decimal for a positive amount", () => {
    expect(parseCapturePrice("45000")).toBe("45000.00");
    expect(parseCapturePrice(" 12 ")).toBe("12.00");
  });

  it("reads a comma as the decimal separator", () => {
    expect(parseCapturePrice("45,5")).toBe("45.50");
    expect(parseCapturePrice("19,99")).toBe("19.99");
  });

  it("reads a dot before three digits as thousands, like the proposals form", () => {
    expect(parseCapturePrice("1.500")).toBe("1500.00");
    expect(parseCapturePrice("1.500,50")).toBe("1500.50");
  });

  it("rejects zero, negatives and anything that is not an amount", () => {
    for (const bad of ["0", "0,00", "-5", "", "  ", "abc", "12abc", "1,234,5", "1,234"]) {
      expect(parseCapturePrice(bad)).toBeNull();
    }
  });
});
