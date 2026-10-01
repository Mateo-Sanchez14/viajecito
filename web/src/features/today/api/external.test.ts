import { expect, it } from "vitest";
import { documentPath } from "./external";
it("restricts download links to same-origin document files", () => {
  expect(documentPath("/api/documents/id/file")).toBe("/api/documents/id/file");
  expect(documentPath("/api/documents/id/file?inline=true")).toBeTruthy();
  for (const value of [
    "//evil.test/file",
    "https://evil.test/file",
    "javascript:alert(1)",
    "/other/file",
    "/api/documents/id/file#fragment",
  ])
    expect(documentPath(value)).toBeNull();
});
