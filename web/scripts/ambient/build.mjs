// Builds the ambient destination loops from clips ALREADY downloaded into scripts/ambient/sources/
// (gitignored; every download needs explicit per-file approval and happens outside this script).
//
//   pnpm ambient:build [--scene city|snow|beach|road] [--dry-run] [--max-mb 3]
//
// Reads scripts/ambient/clips.json, encodes each clip with ffmpeg into a temp dir, checks the result with
// ffprobe, names the files by content hash into public/ambient/ and rewrites src/ui/ambient/manifest.json.
// It NEVER downloads anything. Subprocesses run through execFileSync with argument arrays (no shell).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENES, encodeArgs, hashName, isOwnOutput, posterArgs, serializeManifest, validateClip } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..", "..");
const SOURCES_DIR = path.join(HERE, "sources");
const OUT_DIR = path.join(WEB, "public", "ambient");
const MANIFEST = path.join(WEB, "src", "ui", "ambient", "manifest.json");
const CLIPS = path.join(HERE, "clips.json");

const MB = 1024 * 1024;
const WARN_MB = 2;
const POSTER_MAX_BYTES = 100 * 1024;
const TOTAL_MAX_BYTES = 10 * MB;
const DURATION_TOLERANCE_S = 0.5;

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FFPROBE = process.env.FFPROBE || "ffprobe";

function parseArgs(argv) {
  const options = { scene: null, dryRun: false, maxMb: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--scene") options.scene = argv[++index];
    else if (arg === "--max-mb") options.maxMb = Number(argv[++index]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.scene !== null && !SCENES.includes(options.scene)) throw new Error(`--scene must be one of ${SCENES.join(", ")}`);
  if (!Number.isFinite(options.maxMb) || options.maxMb <= 0) throw new Error("--max-mb must be a positive number");
  return options;
}

const run = (bin, args) => execFileSync(bin, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });

function loadClips() {
  const entries = JSON.parse(fs.readFileSync(CLIPS, "utf8"));
  if (!Array.isArray(entries)) throw new Error("clips.json must be an array");
  const problems = [];
  const seen = new Set();
  entries.forEach((entry, index) => {
    for (const error of validateClip(entry)) problems.push(`clips.json[${index}]: ${error}`);
    if (entry && seen.has(entry.scene)) problems.push(`clips.json[${index}]: scene ${entry.scene} appears twice (one clip per scene)`);
    if (entry) seen.add(entry.scene);
  });
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return entries;
}

/** The source file, which must be a real file that stays inside sources/ (symlinks resolved). */
function resolveSource(file) {
  const root = fs.realpathSync(SOURCES_DIR);
  const candidate = path.resolve(root, file);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${file} escapes sources/`);
  if (!fs.existsSync(candidate)) throw new Error(`${file} is not in scripts/ambient/sources/ (download it first, with approval)`);
  const real = fs.realpathSync(candidate);
  const inside = path.relative(root, real);
  if (inside.startsWith("..") || path.isAbsolute(inside) || !fs.statSync(real).isFile()) throw new Error(`${file} is not a regular file inside sources/`);
  return real;
}

function checkEncoders() {
  const listing = run(FFMPEG, ["-hide_banner", "-encoders"]);
  for (const encoder of ["libx264", "libwebp"]) {
    if (!new RegExp(`^\\s*\\S+\\s+${encoder}\\s`, "m").test(listing)) {
      throw new Error(`${FFMPEG} has no ${encoder} encoder; install an ffmpeg build with libx264 and libwebp`);
    }
  }
}

function probe(file) {
  const base = ["-v", "error", "-protocol_whitelist", "file"];
  const audio = run(FFPROBE, [...base, "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file]).trim();
  const video = run(FFPROBE, [...base, "-select_streams", "v:0", "-show_entries", "stream=codec_name,height", "-of", "csv=p=0", file]).trim();
  const duration = Number(run(FFPROBE, [...base, "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
  const [codec, height] = video.split(",");
  return { audio, codec, height: Number(height), duration };
}

/** Encodes one clip into `tmp` and returns the checked result; throws on any violation. */
function encodeClip(clip, tmp, maxBytes) {
  const input = resolveSource(clip.file);
  const mp4 = path.join(tmp, `${clip.scene}.mp4`);
  const webp = path.join(tmp, `${clip.scene}.webp`);
  run(FFMPEG, encodeArgs({ input, output: mp4, start: clip.start, duration: clip.duration, crf: clip.crf, crop: clip.crop }));
  run(FFMPEG, posterArgs({ input: mp4, output: webp }));

  const facts = probe(mp4);
  if (facts.audio !== "") throw new Error(`${clip.scene}: the encoded clip still has an audio stream`);
  if (facts.codec !== "h264" || !(facts.height <= 720)) throw new Error(`${clip.scene}: expected h264 at <= 720p, got ${facts.codec} ${facts.height}p`);
  if (!(Math.abs(facts.duration - clip.duration) <= DURATION_TOLERANCE_S)) {
    throw new Error(`${clip.scene}: duration ${facts.duration}s is not within ${DURATION_TOLERANCE_S}s of ${clip.duration}s (is the source shorter than start + duration?)`);
  }
  const mp4Bytes = fs.readFileSync(mp4);
  const webpBytes = fs.readFileSync(webp);
  if (mp4Bytes.length > maxBytes) throw new Error(`${clip.scene}: ${(mp4Bytes.length / MB).toFixed(2)} MB is over the ${(maxBytes / MB).toFixed(2)} MB cap`);
  if (webpBytes.length > POSTER_MAX_BYTES) throw new Error(`${clip.scene}: poster ${(webpBytes.length / 1024).toFixed(0)} KB is over the 100 KB cap`);
  if (mp4Bytes.length > WARN_MB * MB) console.warn(`warning: ${clip.scene} is ${(mp4Bytes.length / MB).toFixed(2)} MB (target <= ${WARN_MB} MB)`);
  return { mp4Bytes, webpBytes, hash: hashName(mp4Bytes, webpBytes), duration: facts.duration };
}

function readManifest() {
  if (!fs.existsSync(MANIFEST)) return { clips: {} };
  const parsed = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  return { clips: parsed.clips ?? {} };
}

function dryRun(clips) {
  const tmp = path.join("<tmp>");
  for (const clip of clips) {
    console.log(JSON.stringify([FFMPEG, ...encodeArgs({ input: path.join("scripts/ambient/sources", clip.file), output: `${tmp}/${clip.scene}.mp4`, start: clip.start, duration: clip.duration, crf: clip.crf, crop: clip.crop })]));
    console.log(JSON.stringify([FFMPEG, ...posterArgs({ input: `${tmp}/${clip.scene}.mp4`, output: `${tmp}/${clip.scene}.webp` })]));
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const all = loadClips();
  const clips = options.scene ? all.filter((clip) => clip.scene === options.scene) : all;
  if (clips.length === 0) {
    console.log("ambient:build: no clips to build (clips.json is empty or --scene matched nothing); nothing changed");
    return 0;
  }
  if (options.dryRun) {
    dryRun(clips);
    return 0;
  }

  checkEncoders();
  const maxBytes = options.maxMb * MB;
  const manifest = readManifest();
  const rows = [];
  let failed = false;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const clip of clips) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ambient-"));
    try {
      const built = encodeClip(clip, tmp, maxBytes);
      const mp4Name = `${clip.scene}.${built.hash}.mp4`;
      const webpName = `${clip.scene}.${built.hash}.webp`;
      fs.writeFileSync(path.join(OUT_DIR, mp4Name), built.mp4Bytes);
      fs.writeFileSync(path.join(OUT_DIR, webpName), built.webpBytes);
      // Only this script's own outputs for this scene are ever removed.
      for (const name of fs.readdirSync(OUT_DIR)) {
        if (isOwnOutput(clip.scene, name) && name !== mp4Name && name !== webpName) fs.rmSync(path.join(OUT_DIR, name));
      }
      manifest.clips[clip.scene] = {
        mp4: `/ambient/${mp4Name}`,
        poster: `/ambient/${webpName}`,
        hash: built.hash,
        credit: { author: clip.author, source: clip.source, license: clip.license },
      };
      rows.push({ scene: clip.scene, mp4: `${(built.mp4Bytes.length / 1024).toFixed(0)} KB`, poster: `${(built.webpBytes.length / 1024).toFixed(0)} KB`, seconds: built.duration.toFixed(2), hash: built.hash });
    } catch (error) {
      failed = true;
      console.error(`error: ${error instanceof Error ? error.message : error}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  if (rows.length > 0) {
    fs.writeFileSync(MANIFEST, serializeManifest(manifest.clips));
    console.table(rows);
  }
  const total = Object.values(manifest.clips)
    .flatMap((clip) => [clip.mp4, clip.poster])
    .reduce((sum, url) => sum + (fs.existsSync(path.join(WEB, "public", url)) ? fs.statSync(path.join(WEB, "public", url)).size : 0), 0);
  if (total >= TOTAL_MAX_BYTES) {
    failed = true;
    console.error(`error: ambient payload is ${(total / MB).toFixed(2)} MB, over the 10 MB total cap`);
  }
  return failed ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
