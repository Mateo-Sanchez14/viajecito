// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest.json";
import { bannerPhoto, hashSeed, photoImage, pickScenePhoto, scenePhotos, type PhotoScene } from "./photos";

const WEB = process.cwd();
const SCENES: PhotoScene[] = ["snow", "lake", "beach", "vineyard", "desert", "city", "road"];
const MAX_BYTES = 150 * 1024;
const NAME = /^\/photos\/[a-z][a-z0-9-]*\.[0-9a-f]{10}\.[0-9]+\.webp$/;
const files = Object.values(manifest.photos).flatMap((photo) => photo.variants.map((variant) => variant.src));

describe("the committed photo library", () => {
  it("has a photo for every scene and for every banner", () => {
    for (const scene of SCENES) expect(scenePhotos(scene).length, scene).toBeGreaterThan(0);
    for (const kind of ["logistics", "map", "planner"] as const) expect(bannerPhoto(kind), kind).not.toBeNull();
  });

  it("gives snow, beach and city two photos each and the rest one", () => {
    expect(SCENES.map((scene) => scenePhotos(scene).length)).toEqual([2, 1, 2, 1, 1, 2, 1]);
  });

  it("names every file by content hash under /photos, never /media or /static", () => {
    expect(files.length).toBeGreaterThanOrEqual(26);
    for (const src of files) expect(src, src).toMatch(NAME);
  });

  it("has every listed file on disk, at most 150 KB, and no unlisted file in public/photos", () => {
    for (const src of files) {
      const path = join(WEB, "public", src);
      expect(existsSync(path), src).toBe(true);
      expect(statSync(path).size, src).toBeLessThanOrEqual(MAX_BYTES);
    }
    const onDisk = readdirSync(join(WEB, "public", "photos")).map((name) => `/photos/${name}`);
    expect(onDisk.sort()).toEqual([...files].sort());
  });

  it("stores real WebP files", () => {
    for (const src of files) {
      const head = readFileSync(join(WEB, "public", src)).subarray(0, 12);
      expect(head.subarray(0, 4).toString("ascii"), src).toBe("RIFF");
      expect(head.subarray(8, 12).toString("ascii"), src).toBe("WEBP");
    }
  });

  it("orders variants smallest first with a consistent aspect ratio and no upscaling beyond 1280", () => {
    for (const [id, photo] of Object.entries(manifest.photos)) {
      const widths = photo.variants.map((variant) => variant.width);
      expect(widths, id).toEqual([...widths].sort((a, b) => a - b));
      expect(widths.at(-1), id).toBeLessThanOrEqual(1280);
      const ratios = photo.variants.map((variant) => variant.width / variant.height);
      expect(Math.abs(ratios[0] - ratios[1]), id).toBeLessThan(0.02);
    }
  });

  it("credits every photo to a Pexels page under the Pexels license", () => {
    for (const [id, photo] of Object.entries(manifest.photos)) {
      expect(photo.credit.author.trim(), id).not.toBe("");
      expect(photo.credit.source, id).toMatch(/^https:\/\/www\.pexels\.com\/photo\//);
      expect(photo.credit.license, id).toContain("https://www.pexels.com/license/");
    }
  });

  it("lists every photo in PROVENANCE.md with its author and source", () => {
    const provenance = readFileSync(resolve(WEB, "scripts/photos/PROVENANCE.md"), "utf8");
    for (const [id, photo] of Object.entries(manifest.photos)) {
      expect(provenance, id).toContain(`| ${id} |`);
      expect(provenance, id).toContain(photo.credit.author);
      expect(provenance, id).toContain(photo.credit.source);
    }
    expect(provenance).toContain("2026-10-08");
  });
});

describe("pickScenePhoto", () => {
  it("is deterministic per seed and spreads two-photo scenes over both photos", () => {
    for (const scene of ["snow", "beach", "city"] as const) {
      const seeds = Array.from({ length: 40 }, (_, index) => `trip-${index}`);
      const picks = seeds.map((seed) => pickScenePhoto(scene, seed)!.id);
      expect(new Set(picks).size, scene).toBe(2);
      expect(seeds.map((seed) => pickScenePhoto(scene, seed)!.id)).toEqual(picks);
    }
  });

  it("returns the only photo of a one-photo scene and null for an unknown scene", () => {
    expect(pickScenePhoto("lake", "any")!.id).toBe("lake-patagonia");
    expect(pickScenePhoto("vineyard", "any")!.id).toBe("vineyard");
    expect(pickScenePhoto("desert", "any")!.id).toBe("desert");
    expect(pickScenePhoto("nope" as PhotoScene, "any")).toBeNull();
  });

  it("hashes like the illustration scene picker: stable FNV-1a", () => {
    expect(hashSeed("a")).toBe(hashSeed("a"));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});

describe("photoImage", () => {
  const photo = scenePhotos("lake")[0];

  it("gives the full srcset and the largest variant's size by default", () => {
    const image = photoImage(photo);
    expect(image.srcSet).toMatch(/\.640\.webp 640w, \/photos\/.+\.1280\.webp 1280w$/);
    expect(image.src).toMatch(/\.1280\.webp$/);
    expect([image.width, image.height]).toEqual([1280, 854]);
  });

  it("gives only the smallest variant, with no srcset, when saving data", () => {
    const image = photoImage(photo, { small: true });
    expect(image.srcSet).toBeUndefined();
    expect(image.src).toMatch(/\.640\.webp$/);
    expect(image.width).toBe(640);
  });
});
