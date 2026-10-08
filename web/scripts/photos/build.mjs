// Builds the destination photo library from photos ALREADY downloaded into scripts/photos/sources/
// (gitignored; every download needs explicit per-file approval and happens outside this script).
//
//   pnpm photos:build [--id snow-peaks] [--dry-run]
//
// Reads scripts/photos/photos.json, encodes every photo with ffmpeg into WebP variants (landscape 640 and
// 1280 px wide, portrait 400 and 800), lowering the quality until each file is at most 150 KB (and failing
// when it cannot), names the files by content hash into public/photos/ and rewrites
// src/ui/photos/manifest.json. It NEVER downloads anything. Subprocesses run through execFileSync with
// argument arrays (no shell).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_BYTES, WIDTHS, encodeArgs, hashName, isOwnOutput, qualityLadder, serializeManifest, targetWidths, validateAll, variantName } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..", "..");
const SOURCES_DIR = path.join(HERE, "sources");
const OUT_DIR = path.join(WEB, "public", "photos");
const MANIFEST = path.join(WEB, "src", "ui", "photos", "manifest.json");
const LIST = path.join(HERE, "photos.json");

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FFPROBE = process.env.FFPROBE || "ffprobe";

function parseArgs(argv) {
  const options = { id: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--id") options.id = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

const run = (bin, args) => execFileSync(bin, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });

function loadPhotos() {
  const entries = JSON.parse(fs.readFileSync(LIST, "utf8"));
  if (!Array.isArray(entries)) throw new Error("photos.json must be an array");
  const problems = validateAll(entries);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return entries;
}

/** The source file, which must be a real file that stays inside sources/ (symlinks resolved). */
function resolveSource(file) {
  const root = fs.realpathSync(SOURCES_DIR);
  const candidate = path.resolve(root, file);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${file} escapes sources/`);
  if (!fs.existsSync(candidate)) throw new Error(`${file} is not in scripts/photos/sources/ (download it first, with approval)`);
  const real = fs.realpathSync(candidate);
  const inside = path.relative(root, real);
  if (inside.startsWith("..") || path.isAbsolute(inside) || !fs.statSync(real).isFile()) throw new Error(`${file} is not a regular file inside sources/`);
  return real;
}

function checkEncoder() {
  const listing = run(FFMPEG, ["-hide_banner", "-encoders"]);
  if (!/^\s*\S+\s+libwebp\s/m.test(listing)) throw new Error(`${FFMPEG} has no libwebp encoder; install an ffmpeg build with libwebp`);
}

function probe(file) {
  const out = run(FFPROBE, ["-v", "error", "-protocol_whitelist", "file", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).trim();
  const [width, height] = out.split(",").map(Number);
  return { width, height };
}

/** The best WebP of `width` that fits the cap: the first quality of the ladder that does. */
function encodeVariant(input, tmp, id, width) {
  const output = path.join(tmp, `${id}.${width}.webp`);
  for (const quality of qualityLadder()) {
    run(FFMPEG, encodeArgs({ input, output, width, quality }));
    const bytes = fs.readFileSync(output);
    if (bytes.length <= MAX_BYTES) return { bytes, quality, ...probe(output), width };
  }
  throw new Error(`${id}: ${width}px does not fit ${MAX_BYTES / 1024} KB even at the lowest quality`);
}

function readManifest() {
  if (!fs.existsSync(MANIFEST)) return { photos: {} };
  return { photos: JSON.parse(fs.readFileSync(MANIFEST, "utf8")).photos ?? {} };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const all = loadPhotos();
  const photos = options.id ? all.filter((photo) => photo.id === options.id) : all;
  if (photos.length === 0) {
    console.log("photos:build: nothing to build (--id matched nothing); nothing changed");
    return 0;
  }
  if (options.dryRun) {
    for (const photo of photos) {
      for (const width of WIDTHS[photo.orientation]) {
        console.log(JSON.stringify([FFMPEG, ...encodeArgs({ input: path.join("scripts/photos/sources", photo.file), output: `<tmp>/${photo.id}.${width}.webp`, width, quality: 80 })]));
      }
    }
    return 0;
  }

  checkEncoder();
  const manifest = readManifest();
  const rows = [];
  let failed = false;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const photo of photos) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "photos-"));
    try {
      const input = resolveSource(photo.file);
      const source = probe(input);
      const widths = targetWidths(photo.orientation, source.width);
      const variants = widths.map((width) => encodeVariant(input, tmp, photo.id, width));
      const hash = hashName(variants.map((variant) => variant.bytes));
      for (const variant of variants) fs.writeFileSync(path.join(OUT_DIR, variantName(photo.id, hash, variant.width)), variant.bytes);
      // Only this script's own outputs for this photo are ever removed.
      const keep = new Set(variants.map((variant) => variantName(photo.id, hash, variant.width)));
      for (const name of fs.readdirSync(OUT_DIR)) {
        if (isOwnOutput(photo.id, name) && !keep.has(name)) fs.rmSync(path.join(OUT_DIR, name));
      }
      manifest.photos[photo.id] = {
        ...(photo.scene ? { scene: photo.scene } : { banner: photo.banner }),
        orientation: photo.orientation,
        ...(photo.position ? { position: photo.position } : {}),
        variants: variants.map((variant) => ({ src: `/photos/${variantName(photo.id, hash, variant.width)}`, width: variant.width, height: variant.height })),
        credit: { author: photo.author, source: photo.source, license: photo.license },
      };
      rows.push({ id: photo.id, ...Object.fromEntries(variants.map((variant) => [`${variant.width}px`, `${(variant.bytes.length / 1024).toFixed(0)} KB q${variant.quality}`])), hash });
    } catch (error) {
      failed = true;
      console.error(`error: ${error instanceof Error ? error.message : error}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  if (rows.length > 0) {
    // Entries of photos that are no longer listed are dropped, so the manifest never points at removed files.
    const listed = new Set(all.map((photo) => photo.id));
    for (const id of Object.keys(manifest.photos)) if (!listed.has(id)) delete manifest.photos[id];
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.writeFileSync(MANIFEST, serializeManifest(manifest.photos));
    console.table(rows);
  }
  return failed ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
