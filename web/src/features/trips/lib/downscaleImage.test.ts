import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/errors";
import { COVER_MAX_EDGE, MAX_COVER_BYTES, downscaleImage, fitWithin } from "./downscaleImage";

describe("fitWithin", () => {
  it("bounds the longest side keeping the aspect ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(1281, 1281)).toEqual({ width: 1280, height: 1280 });
  });

  it("never upscales and leaves a small image untouched", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1280, 720)).toEqual({ width: 1280, height: 720 });
  });

  it("never collapses a very thin image to zero", () => {
    expect(fitWithin(20_000, 3)).toEqual({ width: 1280, height: 1 });
  });

  it("takes the bound as a parameter", () => {
    expect(fitWithin(4000, 3000, 640)).toEqual({ width: 640, height: 480 });
    expect(COVER_MAX_EDGE).toBe(1280);
  });
});

function photo(size = 1024) {
  const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function stubBitmap(width: number, height: number) {
  const close = vi.fn();
  const create = vi.fn(async () => ({ width, height, close }));
  vi.stubGlobal("createImageBitmap", create);
  return { close, create };
}

/** An OffscreenCanvas that records its size and encodes to `supported` types only (else PNG). */
function stubOffscreen(supported: string[] = ["image/webp", "image/jpeg"], bytes = 300_000) {
  const encoded: { width: number; height: number; type: string }[] = [];
  class FakeCanvas {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
    getContext() {
      return { drawImage: vi.fn() };
    }
    async convertToBlob({ type }: { type: string }) {
      encoded.push({ width: this.width, height: this.height, type });
      const actual = supported.includes(type) ? type : "image/png";
      return new Blob([new Uint8Array(bytes)], { type: actual });
    }
  }
  vi.stubGlobal("OffscreenCanvas", FakeCanvas);
  return encoded;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("downscaleImage", () => {
  it("decodes with the EXIF orientation applied and bounds a 4000x3000 photo to 1280 as WebP", async () => {
    const { create, close } = stubBitmap(4000, 3000);
    const encoded = stubOffscreen();

    const blob = await downscaleImage(photo(12 * 1024 * 1024));

    expect(create).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
    expect(encoded).toEqual([{ width: 1280, height: 960, type: "image/webp" }]);
    expect(blob.type).toBe("image/webp");
    expect(blob.size).toBeLessThan(MAX_COVER_BYTES);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps a smaller photo at its own size", async () => {
    stubBitmap(800, 600);
    const encoded = stubOffscreen();

    await downscaleImage(photo());

    expect(encoded).toEqual([{ width: 800, height: 600, type: "image/webp" }]);
  });

  it("falls back to JPEG when the browser cannot encode WebP", async () => {
    stubBitmap(2000, 1000);
    const encoded = stubOffscreen(["image/jpeg"]);

    const blob = await downscaleImage(photo());

    expect(encoded.map((call) => call.type)).toEqual(["image/webp", "image/jpeg"]);
    expect(blob.type).toBe("image/jpeg");
  });

  it("uses a regular canvas where OffscreenCanvas does not exist", async () => {
    stubBitmap(3000, 2000);
    vi.stubGlobal("OffscreenCanvas", undefined);
    const draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: draw,
    } as unknown as CanvasRenderingContext2D);
    const sizes: number[][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      callback,
      type,
    ) {
      sizes.push([this.width, this.height]);
      callback(new Blob(["x"], { type }));
    });

    const blob = await downscaleImage(photo());

    expect(sizes).toEqual([[1280, 853]]);
    expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 853);
    expect(blob.type).toBe("image/webp");
  });

  it("sends the original when the browser cannot decode it and the api would take it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("undecodable")));
    const file = photo(2 * 1024 * 1024);

    await expect(downscaleImage(file)).resolves.toBe(file);
  });

  it("refuses an undecodable original over the 5 MiB cap with file_too_large", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("undecodable")));

    await expect(downscaleImage(photo(MAX_COVER_BYTES + 1))).rejects.toMatchObject({
      name: "ApiError",
      code: "file_too_large",
    });
  });

  it("sends the original when encoding fails", async () => {
    const { close } = stubBitmap(3000, 2000);
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const file = photo();

    await expect(downscaleImage(file)).resolves.toBe(file);
    expect(close).toHaveBeenCalledOnce();
  });

  it("refuses an encoded result that is still over the cap", async () => {
    stubBitmap(3000, 2000);
    stubOffscreen(["image/webp"], MAX_COVER_BYTES + 1);

    const failure = await downscaleImage(photo()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: "file_too_large" });
  });
});
