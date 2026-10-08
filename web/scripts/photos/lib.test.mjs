// Run by `pnpm ambient:test` (node --test). No ffmpeg needed: only the pure helpers are exercised.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  BANNERS, MAX_BYTES, MIN_QUALITY, SCENES, WIDTHS, encodeArgs, hashName, isOwnOutput, qualityLadder,
  serializeManifest, targetWidths, validateAll, validatePhoto, variantName,
} from "./lib.mjs";

const valid = {
  id: "snow-peaks",
  file: "snow-peaks-691668.jpg",
  scene: "snow",
  orientation: "landscape",
  author: "Eberhard Grossgasteiger",
  source: "https://www.pexels.com/photo/691668/",
  license: "Pexels License https://www.pexels.com/license/",
  approved: "2026-10-08",
};

describe("validatePhoto", () => {
  it("accepts a scene photo, a banner photo and a focal position", () => {
    assert.deepEqual(validatePhoto(valid), []);
    assert.deepEqual(validatePhoto({ ...valid, scene: undefined, banner: "logistics" }), []);
    assert.deepEqual(validatePhoto({ ...valid, position: "50% 40%" }), []);
    assert.deepEqual(validatePhoto({ ...valid, source: "https://www.pexels.com/photo/mountain-peaks-691668/" }), []);
  });

  it("knows exactly the seven scenes and the three banners", () => {
    assert.deepEqual([...SCENES], ["snow", "lake", "beach", "vineyard", "desert", "city", "road"]);
    assert.deepEqual([...BANNERS], ["logistics", "map", "planner"]);
  });

  for (const file of ["../x.jpg", "/abs.jpg", "https://x/y.jpg", "sub/dir.jpg", "sub\\dir.jpg", "a..b.jpg", ".hidden.jpg", "photo.gif", "photo.jpg.sh", "photo", ""]) {
    it(`rejects the file name ${JSON.stringify(file)}`, () => {
      assert.notDeepEqual(validatePhoto({ ...valid, file }), []);
    });
  }

  it("needs exactly one of scene and banner, each from its list", () => {
    assert.notDeepEqual(validatePhoto({ ...valid, scene: undefined }), []);
    assert.notDeepEqual(validatePhoto({ ...valid, banner: "map" }), []);
    assert.notDeepEqual(validatePhoto({ ...valid, scene: "jungle" }), []);
    assert.notDeepEqual(validatePhoto({ ...valid, scene: undefined, banner: "snow" }), []);
  });

  it("rejects unknown orientations, bad ids and non-photo sources", () => {
    assert.notDeepEqual(validatePhoto({ ...valid, orientation: "square" }), []);
    for (const id of ["Snow", "1snow", "snow_peaks", "", "../x"]) assert.notDeepEqual(validatePhoto({ ...valid, id }), [], id);
    for (const source of ["http://www.pexels.com/photo/1/", "https://pixabay.com/photo/1/", "https://www.pexels.com/video/1/", "https://evil.example/www.pexels.com/photo/1/", "https://www.pexels.com/photo/1/?x=<script>", ""]) {
      assert.notDeepEqual(validatePhoto({ ...valid, source }), [], source);
    }
  });

  it("needs an author, the Pexels license and an approval date", () => {
    assert.notDeepEqual(validatePhoto({ ...valid, author: "  " }), []);
    assert.notDeepEqual(validatePhoto({ ...valid, license: "free" }), []);
    assert.notDeepEqual(validatePhoto({ ...valid, approved: "yesterday" }), []);
    assert.notDeepEqual(validatePhoto({ ...valid, approved: undefined }), []);
  });

  it("rejects a malformed focal position", () => {
    for (const position of ["center", "50 40", "150% 40%", "50% -1%", 5]) assert.notDeepEqual(validatePhoto({ ...valid, position }), [], String(position));
  });

  it("rejects non-objects", () => {
    for (const entry of [null, undefined, "x", 3, []]) assert.notDeepEqual(validatePhoto(entry), []);
  });
});

describe("validateAll", () => {
  const full = [
    ...SCENES.map((scene) => ({ ...valid, id: `p-${scene}`, scene })),
    ...BANNERS.map((banner) => ({ ...valid, id: `b-${banner}`, scene: undefined, banner })),
  ];

  it("accepts a list that covers every scene and banner", () => {
    assert.deepEqual(validateAll(full), []);
  });

  it("reports a scene or a banner without a photo, and duplicate ids", () => {
    assert.ok(validateAll(full.filter((entry) => entry.scene !== "lake")).some((error) => error.includes("scene lake has no photo")));
    assert.ok(validateAll(full.filter((entry) => entry.banner !== "map")).some((error) => error.includes("banner map has no photo")));
    assert.ok(validateAll([...full, { ...full[0] }]).some((error) => error.includes("appears twice")));
  });
});

describe("targetWidths", () => {
  it("gives landscape 640 and 1280, portrait 400 and 800", () => {
    assert.deepEqual(targetWidths("landscape", 1920), [640, 1280]);
    assert.deepEqual(targetWidths("portrait", 1920), [400, 800]);
    assert.deepEqual(WIDTHS.landscape, [640, 1280]);
  });

  it("refuses to upscale a source narrower than the largest width", () => {
    assert.throws(() => targetWidths("landscape", 1279), /at least 1280/);
    assert.throws(() => targetWidths("portrait", 799), /at least 800/);
    assert.throws(() => targetWidths("landscape", Number.NaN), /at least/);
    assert.throws(() => targetWidths("square", 2000), /unknown orientation/);
  });
});

describe("qualityLadder", () => {
  it("starts at 80, steps down by 4 and ends at the floor", () => {
    const steps = qualityLadder();
    assert.equal(steps[0], 80);
    assert.equal(steps.at(-1), MIN_QUALITY);
    assert.deepEqual(steps, [...steps].sort((a, b) => b - a));
  });

  it("keeps the size cap at 150 KB", () => {
    assert.equal(MAX_BYTES, 150 * 1024);
  });
});

describe("encodeArgs", () => {
  const args = encodeArgs({ input: "/s/a.jpg", output: "/t/a.webp", width: 1280, quality: 76 });

  it("scales to the width, writes WebP at the quality and strips metadata", () => {
    assert.ok(args.includes("scale=1280:-2:flags=lanczos"));
    assert.equal(args[args.indexOf("-quality") + 1], "76");
    assert.equal(args[args.indexOf("-c:v") + 1], "libwebp");
    assert.equal(args[args.indexOf("-map_metadata") + 1], "-1");
    assert.equal(args.at(-1), "/t/a.webp");
  });

  it("keeps the protocol whitelist right before -i, so a crafted file cannot open a URL", () => {
    const index = args.indexOf("-protocol_whitelist");
    assert.equal(args[index + 1], "file");
    assert.equal(args[index + 2], "-i");
    assert.equal(args[index + 3], "/s/a.jpg");
  });

  it("only ever puts numbers in the filter expression", () => {
    for (const width of ["1280;rm", 1280.5, 10, 5000, Number.NaN, undefined]) assert.throws(() => encodeArgs({ input: "a", output: "b", width, quality: 80 }), /invalid width/);
    for (const quality of ["80", 80.5, 10, 101, undefined]) assert.throws(() => encodeArgs({ input: "a", output: "b", width: 640, quality }), /invalid quality/);
  });
});

describe("hashName and variantName", () => {
  const a = Buffer.from("small");
  const b = Buffer.from("large");

  it("is the first 10 hex chars of sha256 over the variants in order", () => {
    assert.equal(hashName([a, b]), createHash("sha256").update(a).update(b).digest("hex").slice(0, 10));
    assert.match(hashName([a, b]), /^[0-9a-f]{10}$/);
  });

  it("changes exactly when the bytes or their order change", () => {
    assert.equal(hashName([a, b]), hashName([Buffer.from("small"), Buffer.from("large")]));
    assert.notEqual(hashName([a, b]), hashName([b, a]));
    assert.notEqual(hashName([a, b]), hashName([a, Buffer.from("larger")]));
  });

  it("names variants id.hash.width.webp", () => {
    assert.equal(variantName("snow-peaks", "ca18be1e1b", 1280), "snow-peaks.ca18be1e1b.1280.webp");
  });
});

describe("isOwnOutput", () => {
  it("matches only this photo's hashed variants", () => {
    assert.equal(isOwnOutput("snow-peaks", "snow-peaks.ca18be1e1b.1280.webp"), true);
    assert.equal(isOwnOutput("snow-peaks", "snow-peaks.ca18be1e1b.640.webp"), true);
  });

  it("never matches another photo, an unhashed name, another extension or a bad id", () => {
    assert.equal(isOwnOutput("snow", "snow-peaks.ca18be1e1b.1280.webp"), false);
    assert.equal(isOwnOutput("snow-peaks", "snow-peaks.1280.webp"), false);
    assert.equal(isOwnOutput("snow-peaks", "snow-peaks.ca18be1e1b.1280.jpg"), false);
    assert.equal(isOwnOutput("snow-peaks", "../snow-peaks.ca18be1e1b.1280.webp"), false);
    assert.equal(isOwnOutput("../x", "x.ca18be1e1b.1280.webp"), false);
    assert.equal(isOwnOutput("a.b", "aXb.ca18be1e1b.1280.webp"), false);
  });
});

describe("serializeManifest", () => {
  it("sorts ids and fields, keeps variant order, indents with 2 spaces and ends with a newline", () => {
    const text = serializeManifest({
      b: { scene: "snow", variants: [{ width: 640, src: "x" }, { width: 1280, src: "y" }] },
      a: { scene: "beach" },
    });
    assert.deepEqual(Object.keys(JSON.parse(text).photos), ["a", "b"]);
    assert.deepEqual(Object.keys(JSON.parse(text).photos.b.variants[0]), ["src", "width"]);
    assert.deepEqual(JSON.parse(text).photos.b.variants.map((variant) => variant.width), [640, 1280]);
    assert.ok(text.startsWith('{\n  "photos": {'));
    assert.ok(text.endsWith("}\n"));
  });

  it("is deterministic for the same photos in any insertion order", () => {
    assert.equal(serializeManifest({ a: { x: 1 }, b: { y: 2 } }), serializeManifest({ b: { y: 2 }, a: { x: 1 } }));
  });
});
