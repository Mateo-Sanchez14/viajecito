import { describe, expect, it } from "vitest";
import { parseCaptureUrl } from "./url";

describe("parseCaptureUrl", () => {
  it("accepts http and https links, trimmed", () => {
    expect(parseCaptureUrl(" https://example.com/hotel ")).toBe("https://example.com/hotel");
    expect(parseCaptureUrl("http://example.com")).toBe("http://example.com");
  });

  it("adds https to a bare www host", () => {
    expect(parseCaptureUrl("www.example.com/x")).toBe("https://www.example.com/x");
  });

  it("rejects empty text, other schemes and plain words", () => {
    for (const bad of ["", "   ", "hola", "ftp://example.com", "javascript:alert(1)", "example.com"]) {
      expect(parseCaptureUrl(bad)).toBeNull();
    }
  });
});
