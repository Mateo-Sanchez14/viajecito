// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const WEB = process.cwd();
const SRC = resolve(WEB, "src");
const URL_PATTERN = /^\/ambient\/(city|snow|beach|road)\.[0-9a-f]{10}\.(mp4|webp)$/;

afterEach(() => {
  vi.doUnmock("./manifest.json");
  vi.resetModules();
});

const SAMPLE = {
  clips: {
    city: {
      mp4: "/ambient/city.3f9a1c2e7b.mp4",
      poster: "/ambient/city.3f9a1c2e7b.webp",
      hash: "3f9a1c2e7b",
      credit: { author: "Amit", source: "https://www.pexels.com/video/x-1/", license: "Pexels License" },
    },
  },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("ambientClip", () => {
  it("returns null for every scene when the manifest has no entry, and never throws", async () => {
    vi.doMock("./manifest.json", () => ({ default: { clips: {} } }));
    const { ambientClip } = await import("./scenes");

    for (const scene of ["city", "snow", "beach", "road"] as const) expect(ambientClip(scene)).toBeNull();
    expect(ambientClip("nope" as never)).toBeNull();
  });

  it("returns the manifest entry for a scene that has one, and null for the others", async () => {
    vi.doMock("./manifest.json", () => ({ default: SAMPLE }));
    const { ambientClip } = await import("./scenes");

    expect(ambientClip("city")).toEqual(SAMPLE.clips.city);
    expect(ambientClip("beach")).toBeNull();
  });

  it("keeps the global kill switch on by default", async () => {
    const { AMBIENT_VIDEO_ENABLED } = await import("./scenes");

    expect(AMBIENT_VIDEO_ENABLED).toBe(true);
  });
});

describe("committed manifest", () => {
  const manifest = JSON.parse(readFileSync(resolve(SRC, "ui/ambient/manifest.json"), "utf8")) as {
    clips: Record<string, { mp4: string; poster: string; hash: string; credit: { author: string; source: string; license: string } }>;
  };

  it("works with zero entries and otherwise names only hashed, self-hosted files that exist", () => {
    for (const [scene, clip] of Object.entries(manifest.clips)) {
      for (const url of [clip.mp4, clip.poster]) {
        expect(url, `${scene} ${url}`).toMatch(URL_PATTERN);
        expect(url.startsWith("/media"), url).toBe(false);
        expect(url.startsWith(`/ambient/${scene}.`), url).toBe(true);
        expect(existsSync(resolve(WEB, "public", `.${url}`)), `public${url}`).toBe(true);
      }
      expect(clip.mp4).toContain(`.${clip.hash}.`);
      expect(clip.poster).toContain(`.${clip.hash}.`);
      expect(clip.credit.author).not.toBe("");
      expect(clip.credit.source).toMatch(/^https:\/\/(www\.pexels\.com|pixabay\.com)\//);
      expect(clip.credit.license).not.toBe("");
    }
  });

  it("only names the four scenes", () => {
    for (const scene of Object.keys(manifest.clips)) expect(["city", "snow", "beach", "road"]).toContain(scene);
  });

  it("has a poster-or-clip file for every file in public/ambient (no orphans)", () => {
    const dir = resolve(WEB, "public/ambient");
    if (!existsSync(dir)) return;
    const referenced = new Set(Object.values(manifest.clips).flatMap((clip) => [clip.mp4, clip.poster]));
    for (const name of readdirSync(dir)) expect(referenced.has(`/ambient/${name}`), name).toBe(true);
  });
});

describe("AmbientVideo usage", () => {
  it("is imported only by the trip hero, the home hero and the login backdrop", () => {
    const importers = sourceFiles(SRC)
      .filter((file) => !/\.test\.tsx?$/.test(file) && !file.endsWith("AmbientVideo.tsx"))
      .filter((file) => /from\s+["']@\/ui\/molecules\/AmbientVideo["']/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file))
      .sort();

    expect(importers).toEqual([
      "features/auth/containers/LoginBackdropContainer.tsx",
      "features/trips/containers/HomeHero.tsx",
      "features/trips/containers/TripHero.tsx",
    ]);
  });
});
