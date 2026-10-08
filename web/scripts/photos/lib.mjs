// Pure helpers of the destination photo pipeline (build.mjs). No I/O here, so every rule that protects
// the build from a crafted input is unit-tested without ffmpeg. See lib.test.mjs.
import { createHash } from "node:crypto";

/** Trip scenes (cards, hero, create sheet) and the section banners a photo can serve. */
export const SCENES = ["snow", "lake", "beach", "vineyard", "desert", "city", "road"];
export const BANNERS = ["logistics", "map", "planner"];

export const MAX_BYTES = 150 * 1024;
export const MIN_QUALITY = 40;
export const START_QUALITY = 80;
export const QUALITY_STEP = 4;
export const APPROVED_ON = /^\d{4}-\d{2}-\d{2}$/;

/** Widths per orientation, smallest first. The largest never upscales a source narrower than it. */
export const WIDTHS = { landscape: [640, 1280], portrait: [400, 800] };

const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png)$/;
const ID = /^[a-z][a-z0-9-]*$/;
const SOURCE = /^https:\/\/www\.pexels\.com\/photo\/[A-Za-z0-9-]+\/?$/;
const POSITION = /^(\d{1,3})% (\d{1,3})%$/;
const isText = (value) => typeof value === "string" && value.trim() !== "";

/**
 * Problems with one entry of photos.json (an empty array means valid). `file` is a plain name inside
 * scripts/photos/sources/ (no separators, no `..`, no URL); every entry serves exactly one scene or one
 * banner; the source must be a Pexels photo page and the approval a date.
 */
export function validatePhoto(entry) {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return ["entry must be an object"];
  const errors = [];
  if (typeof entry.id !== "string" || !ID.test(entry.id)) errors.push("id must be lowercase letters, digits and dashes");
  if (typeof entry.file !== "string" || !FILE.test(entry.file) || entry.file.includes(".."))
    errors.push("file must be a plain .jpg/.jpeg/.png file name inside sources/");
  const hasScene = entry.scene !== undefined;
  const hasBanner = entry.banner !== undefined;
  if (hasScene === hasBanner) errors.push("set exactly one of scene or banner");
  if (hasScene && !SCENES.includes(entry.scene)) errors.push(`scene must be one of ${SCENES.join(", ")}`);
  if (hasBanner && !BANNERS.includes(entry.banner)) errors.push(`banner must be one of ${BANNERS.join(", ")}`);
  if (entry.orientation !== "landscape" && entry.orientation !== "portrait") errors.push("orientation must be landscape or portrait");
  if (typeof entry.source !== "string" || !SOURCE.test(entry.source)) errors.push("source must be a https://www.pexels.com/photo/ URL");
  if (!isText(entry.author)) errors.push("author must not be empty");
  if (!isText(entry.license) || !entry.license.includes("https://www.pexels.com/license/")) errors.push("license must cite https://www.pexels.com/license/");
  if (typeof entry.approved !== "string" || !APPROVED_ON.test(entry.approved)) errors.push("approved must be a YYYY-MM-DD date");
  if (entry.position !== undefined) {
    const match = typeof entry.position === "string" ? POSITION.exec(entry.position) : null;
    if (!match || Number(match[1]) > 100 || Number(match[2]) > 100) errors.push('position must look like "50% 40%" (0-100)');
  }
  return errors;
}

/** Problems across the whole file: duplicate ids, and every scene needing at least one photo. */
export function validateAll(entries) {
  const errors = [];
  const ids = new Set();
  entries.forEach((entry, index) => {
    for (const error of validatePhoto(entry)) errors.push(`photos.json[${index}]: ${error}`);
    if (entry && ids.has(entry.id)) errors.push(`photos.json[${index}]: id ${entry.id} appears twice`);
    if (entry) ids.add(entry.id);
  });
  for (const scene of SCENES) {
    if (!entries.some((entry) => entry && entry.scene === scene)) errors.push(`scene ${scene} has no photo`);
  }
  for (const banner of BANNERS) {
    if (!entries.some((entry) => entry && entry.banner === banner)) errors.push(`banner ${banner} has no photo`);
  }
  return errors;
}

/** The widths to encode for a source of `sourceWidth`; throws when even the largest would upscale. */
export function targetWidths(orientation, sourceWidth) {
  const widths = WIDTHS[orientation];
  if (!widths) throw new Error(`unknown orientation ${JSON.stringify(orientation)}`);
  if (!Number.isFinite(sourceWidth) || sourceWidth < widths[widths.length - 1])
    throw new Error(`source is ${sourceWidth}px wide; ${orientation} photos need at least ${widths[widths.length - 1]}px`);
  return widths;
}

/** Quality values to try, best first: 80, 76, ... down to 40. */
export function qualityLadder() {
  const steps = [];
  for (let quality = START_QUALITY; quality >= MIN_QUALITY; quality -= QUALITY_STEP) steps.push(quality);
  return steps;
}

/** ffmpeg argv: scale to `width` (height keeps the ratio, even), WebP at `quality`, no metadata. */
export function encodeArgs({ input, output, width, quality }) {
  if (!Number.isInteger(width) || width < 64 || width > 4096) throw new Error(`invalid width ${JSON.stringify(width)}`);
  if (!Number.isInteger(quality) || quality < MIN_QUALITY || quality > 100) throw new Error(`invalid quality ${JSON.stringify(quality)}`);
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-protocol_whitelist", "file", "-i", input,
    "-frames:v", "1", "-an", "-sn", "-dn", "-map_metadata", "-1",
    "-vf", `scale=${width}:-2:flags=lanczos`,
    "-c:v", "libwebp", "-quality", String(quality), "-compression_level", "6",
    output,
  ];
}

/** First 10 hex chars of sha256 over every variant, in order: the names change exactly when the bytes do. */
export function hashName(variants) {
  const hash = createHash("sha256");
  for (const bytes of variants) hash.update(bytes);
  return hash.digest("hex").slice(0, 10);
}

export const variantName = (id, hash, width) => `${id}.${hash}.${width}.webp`;

/** Whether `name` is an output this script wrote for `id`; the only files it may ever delete. */
export function isOwnOutput(id, name) {
  if (!ID.test(id)) return false;
  return new RegExp(`^${id}\\.[0-9a-f]{10}\\.[0-9]+\\.webp$`).test(name);
}

const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
      : value;

/** The manifest text: ids and fields sorted (variants keep their order), 2-space JSON, trailing newline. */
export function serializeManifest(photos) {
  return `${JSON.stringify({ photos: sorted(photos) }, null, 2)}\n`;
}
