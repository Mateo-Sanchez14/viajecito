import { ApiError } from "@/shared/api/errors";

/** Longest side of an uploaded cover: the same edge the api bounds a cover to. */
export const COVER_MAX_EDGE = 1280;
/** The api rejects anything above this before reading it. */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
const QUALITY = 0.85;

/** The size that fits inside `max` x `max` keeping the aspect ratio. Smaller images are never upscaled. */
export function fitWithin(width: number, height: number, max = COVER_MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Draws the bitmap at the given size and encodes it; resolves `null` when the browser cannot. */
async function encode(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
  type: "image/webp" | "image/jpeg",
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return canvas.convertToBlob({ type, quality: QUALITY });
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/** What to send when the browser cannot decode the file: the original, if the api would take it. */
function original(file: File): Blob {
  if (file.size > MAX_COVER_BYTES) throw new ApiError("file_too_large", 0);
  return file;
}

/**
 * Prepares a picked photo for upload: applies its EXIF orientation, bounds the longest side to
 * `COVER_MAX_EDGE` and re-encodes it (WebP, or JPEG where the browser cannot encode WebP). A
 * 12 MB phone photo becomes a few hundred KB, well under the api cap. When the browser cannot
 * decode the file the original is sent as is (the api decides), unless it is over the cap.
 */
export async function downscaleImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return original(file);
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    let blob = await encode(bitmap, size, "image/webp");
    if (blob && blob.type !== "image/webp") blob = await encode(bitmap, size, "image/jpeg");
    if (!blob || blob.size === 0) return original(file);
    if (blob.size > MAX_COVER_BYTES) throw new ApiError("file_too_large", 0);
    return blob;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return original(file);
  } finally {
    bitmap.close();
  }
}
