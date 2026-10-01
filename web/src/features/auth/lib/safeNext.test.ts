import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeNext";

describe("safeNextPath", () => {
  it.each([
    ["/trips/abc", "/trips/abc"],
    ["/trips?tab=1#x", "/trips?tab=1#x"],
    ["/", "/"],
  ])("keeps the same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "trips/abc",
    "/ok\nHost: evil",
  ])("falls back to / for %j", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});
