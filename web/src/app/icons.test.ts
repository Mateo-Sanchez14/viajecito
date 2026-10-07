// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it , vi } from "vitest";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const file = (path: string) => resolve(process.cwd(), path);
const read = (path: string) => readFileSync(file(path));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buffer: Buffer): [number, number] {
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(buffer.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

describe("generated icon files", () => {
  it.each([
    ["public/icons/icon-192.png", 192],
    ["public/icons/icon-512.png", 512],
    ["public/icons/icon-maskable-512.png", 512],
    ["src/app/apple-icon.png", 180],
  ])("%s is a %ipx square PNG", (path, size) => {
    expect(pngSize(read(path))).toEqual([size, size]);
  });

  it("ships the favicon as a valid PNG-in-ICO with 16px and 32px images", () => {
    const ico = read("src/app/favicon.ico");

    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // icon type
    const count = ico.readUInt16LE(4);
    expect(count).toBe(2);
    const sizes = Array.from({ length: count }, (_, index) => {
      const entry = 6 + index * 16;
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      const [width, height] = pngSize(ico.subarray(offset, offset + length));
      expect([ico.readUInt8(entry), ico.readUInt8(entry + 1)]).toEqual([width, height]);
      expect(offset + length).toBeLessThanOrEqual(ico.length);
      return width;
    });
    expect(sizes).toEqual([16, 32]);
  });

  it("keeps the app icon in sync with the public SVG and the maskable one full-bleed", () => {
    expect(read("src/app/icon.svg").toString()).toBe(read("public/icons/icon.svg").toString());
    const maskable = read("public/icons/icon-maskable.svg").toString();
    expect(maskable).toMatch(/<rect width="512" height="512" fill=/);
    expect(maskable).not.toMatch(/rx=/);
  });

  it("only paints brand colors in the SVGs", () => {
    for (const path of ["public/icons/icon.svg", "public/icons/icon-maskable.svg"]) {
      const colors = new Set(read(path).toString().match(/#[0-9a-f]{6}/gi));
      expect([...colors].sort()).toEqual(["#193d33", "#f1a088", "#f6f2e9"]);
    }
  });
});

describe("maskable icon safe zone", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it("keeps the whole mark inside the central 80 percent", async () => {
    const page = await browser.newPage();
    const base64 = read("public/icons/icon-maskable-512.png").toString("base64");
    const bounds = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const { data: pixels, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      // The background is the corner color: everything that differs from it is the mark.
      const [r, g, b] = pixels;
      let left = width, top = height, right = 0, bottom = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          if (Math.abs(pixels[i] - r) + Math.abs(pixels[i + 1] - g) + Math.abs(pixels[i + 2] - b) > 24) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      return { left, top, right, bottom, width, height, opaque: pixels[3] === 255 };
    }, base64);

    expect(bounds.opaque).toBe(true);
    const margin = bounds.width * 0.1;
    expect(bounds.left).toBeGreaterThanOrEqual(margin);
    expect(bounds.top).toBeGreaterThanOrEqual(margin);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width - margin);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height - margin);
  });
});
