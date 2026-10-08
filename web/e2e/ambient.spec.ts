import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type Clip = { mp4: string; poster: string };
const manifest = JSON.parse(readFileSync("src/ui/ambient/manifest.json", "utf8")) as { clips: Record<string, Clip> };
const clips = Object.entries(manifest.clips);

// Safari and iOS need byte-range answers to play a video at all; the files are content-hashed and immutable.
// With an empty manifest there is nothing to request: one visibly skipped test says so.
test("ambient clips are served with Range support and immutable headers", () => {
  test.skip(clips.length === 0, "no ambient clips are committed yet (empty manifest)");
  expect(clips.length).toBeGreaterThan(0);
});

for (const [scene, clip] of clips) {
  test(`${scene} clip answers Range with 206 and an immutable cache header`, async ({ request }) => {
    const response = await request.get(clip.mp4, { headers: { Range: "bytes=0-1" } });

    expect(response.status()).toBe(206);
    expect(response.headers()["content-range"]).toMatch(/^bytes 0-1\/\d+$/);
    expect(response.headers()["accept-ranges"]).toBe("bytes");
    expect(response.headers()["cache-control"]).toContain("immutable");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test(`${scene} poster is served immutable`, async ({ request }) => {
    const response = await request.get(clip.poster);

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("immutable");
    expect(response.headers()["content-type"]).toContain("image/webp");
  });
}
