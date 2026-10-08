import { expect, test } from "@playwright/test";
import manifest from "../src/ui/photos/manifest.json";

const files = Object.values(manifest.photos).flatMap((photo) => photo.variants.map((variant) => variant.src));

test("photos are served as WebP with immutable caching, under /photos (never /media or /static)", async ({ request }) => {
  expect(files.length).toBeGreaterThanOrEqual(26);
  for (const src of files) {
    expect(src.startsWith("/photos/")).toBe(true);
    const response = await request.get(src);
    expect(response.status(), src).toBe(200);
    expect(response.headers()["content-type"], src).toContain("image/webp");
    expect(response.headers()["cache-control"], src).toBe("public, max-age=31536000, immutable");
    expect(response.headers()["x-content-type-options"], src).toBe("nosniff");
    expect((await response.body()).length, src).toBeLessThanOrEqual(150 * 1024);
  }
});
