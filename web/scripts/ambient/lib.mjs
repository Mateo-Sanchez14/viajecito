// Pure helpers of the ambient asset pipeline (build.mjs). No I/O here, so every rule that protects
// the build from a crafted input is unit-tested without ffmpeg. See lib.test.mjs.
import { createHash } from "node:crypto";

export const SCENES = ["city", "snow", "beach", "road"];

const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(mp4|mov|webm)$/;
const SOURCES = ["https://www.pexels.com/", "https://pixabay.com/"];
const isText = (value) => typeof value === "string" && value.trim() !== "";
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * Problems with one entry of clips.json (an empty array means valid). The file name must be a plain
 * name inside scripts/ambient/sources/: no separators, no `..`, no URL, a video extension.
 */
export function validateClip(entry) {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return ["entry must be an object"];
  const errors = [];
  if (!SCENES.includes(entry.scene)) errors.push(`scene must be one of ${SCENES.join(", ")}`);
  if (typeof entry.file !== "string" || !FILE.test(entry.file) || entry.file.includes(".."))
    errors.push("file must be a plain .mp4/.mov/.webm file name inside sources/");
  if (!isNumber(entry.start) || entry.start < 0) errors.push("start must be a number >= 0");
  if (!isNumber(entry.duration) || entry.duration < 6 || entry.duration > 10)
    errors.push("duration must be a number from 6 to 10 seconds");
  if (typeof entry.source !== "string" || !SOURCES.some((prefix) => entry.source.startsWith(prefix)))
    errors.push("source must be a pexels.com or pixabay.com https URL");
  if (!isText(entry.author)) errors.push("author must not be empty");
  if (!isText(entry.license)) errors.push("license must not be empty");
  return errors;
}

/**
 * ffmpeg argv for the loop: trimmed, 720p, 30 fps constant, H.264 high/4.0, no audio, no
 * subtitles, no data streams, no metadata, moov atom first. `-protocol_whitelist file` comes
 * right before `-i` so a crafted container cannot make ffmpeg open a network or concat URL.
 */
export function encodeArgs({ input, output, start, duration }) {
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-ss", String(start), "-t", String(duration),
    "-protocol_whitelist", "file", "-i", input,
    "-an", "-sn", "-dn", "-map_metadata", "-1",
    "-vf", "scale=-2:720:flags=lanczos,fps=30,format=yuv420p",
    "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "high", "-level", "4.0", "-tag:v", "avc1",
    "-movflags", "+faststart",
    output,
  ];
}

/** ffmpeg argv for the poster: the first frame of the ENCODED clip as WebP. */
export function posterArgs({ input, output }) {
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-protocol_whitelist", "file", "-i", input,
    "-frames:v", "1", "-c:v", "libwebp", "-quality", "72", "-compression_level", "6",
    output,
  ];
}

/** First 10 hex chars of sha256(mp4 || webp): the file names change exactly when the bytes do. */
export function hashName(mp4Bytes, webpBytes) {
  return createHash("sha256").update(mp4Bytes).update(webpBytes).digest("hex").slice(0, 10);
}

/** Whether `name` is an output this script wrote for `scene`; the only files it may ever delete. */
export function isOwnOutput(scene, name) {
  if (!SCENES.includes(scene)) return false;
  return new RegExp(`^${scene}\\.[0-9a-f]{10}\\.(mp4|webp)$`).test(name);
}

const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
      : value;

/** The manifest text: scenes and fields sorted, 2-space JSON, trailing newline. Deterministic. */
export function serializeManifest(clips) {
  return `${JSON.stringify({ clips: sorted(clips) }, null, 2)}\n`;
}
