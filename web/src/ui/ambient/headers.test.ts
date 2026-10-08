// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

type Rule = { source: string; headers: { key: string; value: string }[] };

describe("next.config headers for /ambient", () => {
  it("serves hashed ambient files as public, immutable and nosniff, and nothing else", async () => {
    const rules = (await nextConfig.headers?.()) as Rule[];

    const ambient = rules.filter((rule) => rule.source.startsWith("/ambient"));
    expect(ambient).toHaveLength(1);
    expect(ambient[0].source).toBe("/ambient/:path*");
    const headers = Object.fromEntries(ambient[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
    expect(headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    // Nothing broader may change caching for the rest of the app.
    expect(rules.every((rule) => rule.source.startsWith("/ambient"))).toBe(true);
  });
});
