// Run by `pnpm ambient:test` (node --test). No ffmpeg needed: only the pure helpers are exercised.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { DEFAULT_CRF, SCENES, encodeArgs, hashName, isOwnOutput, posterArgs, serializeManifest, validateClip } from "./lib.mjs";

const valid = {
  scene: "city",
  file: "city-1654210.mp4",
  start: 0.5,
  duration: 8,
  author: "Amit",
  source: "https://www.pexels.com/video/city-view-in-timelapse-mode-1654210/",
  license: "Pexels License https://www.pexels.com/license/",
};

describe("validateClip", () => {
  it("accepts a valid entry", () => {
    assert.deepEqual(validateClip(valid), []);
    assert.deepEqual(validateClip({ ...valid, file: "a.mov", source: "https://pixabay.com/videos/x-1/" }), []);
    assert.deepEqual(validateClip({ ...valid, start: 0, duration: 6 }), []);
    assert.deepEqual(validateClip({ ...valid, duration: 10 }), []);
  });

  it("knows exactly the four scenes", () => {
    assert.deepEqual([...SCENES], ["city", "snow", "beach", "road"]);
  });

  for (const file of [
    "../x.mp4",
    "/abs.mp4",
    "https://x/y.mp4",
    "sub/dir.mp4",
    "sub\\dir.mp4",
    "a..b.mp4",
    ".hidden.mp4",
    "clip.gif",
    "clip.mp4.sh",
    "clip",
    "",
  ]) {
    it(`rejects the file name ${JSON.stringify(file)}`, () => {
      assert.notDeepEqual(validateClip({ ...valid, file }), []);
    });
  }

  it("rejects an unknown scene", () => {
    assert.notDeepEqual(validateClip({ ...valid, scene: "desert" }), []);
    assert.notDeepEqual(validateClip({ ...valid, scene: undefined }), []);
  });

  it("rejects a duration outside 6 to 10 seconds, and non-numbers", () => {
    for (const duration of [5.9, 10.1, 0, -1, "8", Number.NaN, Infinity, undefined]) {
      assert.notDeepEqual(validateClip({ ...valid, duration }), [], `duration ${duration}`);
    }
  });

  it("rejects a negative or non-numeric start", () => {
    for (const start of [-0.1, "1", Number.NaN, undefined]) {
      assert.notDeepEqual(validateClip({ ...valid, start }), [], `start ${start}`);
    }
  });

  it("rejects a source that is not pexels or pixabay over https", () => {
    for (const source of [
      "https://www.pinterest.com/pin/1/",
      "https://unsplash.com/videos/x",
      "http://www.pexels.com/video/x",
      "https://www.pexels.com.evil.example/x",
      "https://evilpexels.com/x",
      "",
    ]) {
      assert.notDeepEqual(validateClip({ ...valid, source }), [], source);
    }
  });

  it("rejects an empty author or license", () => {
    assert.notDeepEqual(validateClip({ ...valid, author: "" }), []);
    assert.notDeepEqual(validateClip({ ...valid, author: "   " }), []);
    assert.notDeepEqual(validateClip({ ...valid, license: "" }), []);
  });

  it("accepts the optional crf (integer 18 to 35) and crop (w:h ratio)", () => {
    assert.deepEqual(validateClip({ ...valid, crf: 18 }), []);
    assert.deepEqual(validateClip({ ...valid, crf: 35, crop: "16:9" }), []);
    assert.deepEqual(validateClip({ ...valid, crop: "4:3" }), []);
  });

  it("rejects a crf outside 18 to 35 or that is not an integer", () => {
    for (const crf of [17, 36, 0, -1, 27.5, "27", Number.NaN, null]) {
      assert.notDeepEqual(validateClip({ ...valid, crf }), [], `crf ${crf}`);
    }
  });

  it("rejects a crop that is not a plain ratio (nothing else may reach the filter graph)", () => {
    for (const crop of ["16-9", "16:", ":9", "0:9", "16:0", "100:9", "w:h", "16:9,scale=1:1", "16:9'", "iw:ih", 1.5, null, ""]) {
      assert.notDeepEqual(validateClip({ ...valid, crop }), [], `crop ${crop}`);
    }
  });

  it("rejects something that is not an object", () => {
    for (const entry of [null, undefined, "x", 3, []]) assert.notDeepEqual(validateClip(entry), []);
  });
});

describe("encodeArgs", () => {
  const args = encodeArgs({ input: "/s/city.mp4", output: "/t/out.mp4", start: 0.5, duration: 8 });

  it("is an argv array, never a shell string", () => {
    assert.ok(Array.isArray(args));
    for (const part of args) assert.equal(typeof part, "string");
  });

  it("whitelists only the file protocol immediately before the input", () => {
    const at = args.indexOf("-i");
    assert.ok(at > 1);
    assert.deepEqual(args.slice(at - 2, at + 2), ["-protocol_whitelist", "file", "-i", "/s/city.mp4"]);
    assert.equal(args.indexOf("-protocol_whitelist"), at - 2);
  });

  it("never reads stdin and strips audio, subtitles, data streams and metadata", () => {
    assert.ok(args.includes("-nostdin"));
    for (const flag of ["-an", "-sn", "-dn"]) assert.ok(args.includes(flag), flag);
    const meta = args.indexOf("-map_metadata");
    assert.equal(args[meta + 1], "-1");
  });

  it("moves the moov atom first and writes to the given output last", () => {
    const flags = args.indexOf("-movflags");
    assert.equal(args[flags + 1], "+faststart");
    assert.equal(args.at(-1), "/t/out.mp4");
  });

  it("trims with the requested start and duration and encodes 720p H.264", () => {
    assert.equal(args[args.indexOf("-ss") + 1], "0.5");
    assert.equal(args[args.indexOf("-t") + 1], "8");
    assert.match(args[args.indexOf("-vf") + 1], /scale=-2:720/);
    assert.equal(args[args.indexOf("-c:v") + 1], "libx264");
    assert.ok(args.indexOf("-ss") < args.indexOf("-i"), "fast input seek");
  });
});

describe("encodeArgs per-clip options", () => {
  const base = { input: "/s/road.mp4", output: "/t/out.mp4", start: 4, duration: 6 };

  it("keeps CRF 27 and no crop by default", () => {
    const args = encodeArgs(base);
    assert.equal(DEFAULT_CRF, 27);
    assert.equal(args[args.indexOf("-crf") + 1], "27");
    assert.equal(args[args.indexOf("-vf") + 1], "scale=-2:720:flags=lanczos,fps=30,format=yuv420p");
  });

  it("uses the clip's crf", () => {
    const args = encodeArgs({ ...base, crf: 30 });
    assert.equal(args[args.indexOf("-crf") + 1], "30");
  });

  it("center-crops to the ratio before the 720p scale", () => {
    const args = encodeArgs({ ...base, crop: "16:9" });
    assert.equal(
      args[args.indexOf("-vf") + 1],
      "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=-2:720:flags=lanczos,fps=30,format=yuv420p",
    );
  });

  it("keeps the safety flags with the options on", () => {
    const args = encodeArgs({ ...base, crf: 30, crop: "16:9" });
    const at = args.indexOf("-i");
    assert.deepEqual(args.slice(at - 2, at + 2), ["-protocol_whitelist", "file", "-i", "/s/road.mp4"]);
    for (const flag of ["-nostdin", "-an", "-sn", "-dn"]) assert.ok(args.includes(flag), flag);
  });

  it("refuses an out-of-range crf or a malformed crop instead of building argv", () => {
    assert.throws(() => encodeArgs({ ...base, crf: 40 }));
    assert.throws(() => encodeArgs({ ...base, crf: 17 }));
    assert.throws(() => encodeArgs({ ...base, crf: "30" }));
    assert.throws(() => encodeArgs({ ...base, crop: "16:9,scale=1:1" }));
  });
});

describe("posterArgs", () => {
  const args = posterArgs({ input: "/t/out.mp4", output: "/t/out.webp" });

  it("whitelists only the file protocol right before the input and never reads stdin", () => {
    const at = args.indexOf("-i");
    assert.deepEqual(args.slice(at - 2, at + 2), ["-protocol_whitelist", "file", "-i", "/t/out.mp4"]);
    assert.ok(args.includes("-nostdin"));
  });

  it("writes one WebP frame to the output", () => {
    assert.equal(args[args.indexOf("-frames:v") + 1], "1");
    assert.equal(args[args.indexOf("-c:v") + 1], "libwebp");
    assert.equal(args.at(-1), "/t/out.webp");
  });
});

describe("hashName", () => {
  it("is the first 10 hex chars of sha256(mp4 || webp)", () => {
    const mp4 = Buffer.from("mp4-bytes");
    const webp = Buffer.from("webp-bytes");
    const expected = createHash("sha256").update(Buffer.concat([mp4, webp])).digest("hex").slice(0, 10);

    assert.equal(hashName(mp4, webp), expected);
    assert.match(hashName(mp4, webp), /^[0-9a-f]{10}$/);
  });

  it("changes when either file changes", () => {
    const base = hashName(Buffer.from("a"), Buffer.from("b"));

    assert.notEqual(hashName(Buffer.from("a2"), Buffer.from("b")), base);
    assert.notEqual(hashName(Buffer.from("a"), Buffer.from("b2")), base);
  });
});

describe("isOwnOutput", () => {
  it("matches only <scene>.<10 hex>.(mp4|webp) of that exact scene", () => {
    assert.equal(isOwnOutput("city", "city.0123456789.mp4"), true);
    assert.equal(isOwnOutput("city", "city.abcdef0123.webp"), true);
  });

  it("refuses everything else, so nothing but our own outputs is ever deleted", () => {
    for (const name of [
      "snow.0123456789.mp4",
      "city.0123456789.mov",
      "city.012345678.mp4",
      "city.01234567890.mp4",
      "city.0123456789A.mp4",
      "city.ABCDEF0123.mp4",
      "city.0123456789.mp4.bak",
      "../city.0123456789.mp4",
      "sub/city.0123456789.mp4",
      "city-extra.0123456789.mp4",
      "mycity.0123456789.mp4",
      "README.md",
      "",
    ]) {
      assert.equal(isOwnOutput("city", name), false, name);
    }
  });

  it("does not let a scene name act as a regex", () => {
    assert.equal(isOwnOutput("c.ty", "city.0123456789.mp4"), false);
    assert.equal(isOwnOutput(".*", "city.0123456789.mp4"), false);
  });
});

describe("serializeManifest", () => {
  const clip = (scene) => ({
    mp4: `/ambient/${scene}.0123456789.mp4`,
    poster: `/ambient/${scene}.0123456789.webp`,
    hash: "0123456789",
    credit: { source: "https://www.pexels.com/video/x-1/", author: "A", license: "L" },
  });

  it("sorts scene and field keys, indents with 2 spaces and ends with a newline", () => {
    const text = serializeManifest({ snow: clip("snow"), city: clip("city") });

    assert.ok(text.endsWith("}\n"));
    assert.ok(text.indexOf('"city"') < text.indexOf('"snow"'));
    const parsed = JSON.parse(text);
    assert.deepEqual(Object.keys(parsed.clips), ["city", "snow"]);
    assert.deepEqual(Object.keys(parsed.clips.city), ["credit", "hash", "mp4", "poster"]);
    assert.deepEqual(Object.keys(parsed.clips.city.credit), ["author", "license", "source"]);
    assert.match(text, /\n {2}"clips": \{\n {4}"city": \{/);
  });

  it("is deterministic for the same clips in any insertion order", () => {
    assert.equal(
      serializeManifest({ snow: clip("snow"), city: clip("city") }),
      serializeManifest({ city: clip("city"), snow: clip("snow") }),
    );
  });

  it("serializes no clips as the committed empty manifest", () => {
    assert.equal(serializeManifest({}), '{\n  "clips": {}\n}\n');
  });
});
