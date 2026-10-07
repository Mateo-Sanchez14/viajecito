// Renders the committed icon SVGs to every PNG/ICO the app ships, with the Chromium that
// Playwright already provides. Run by hand after editing an SVG: `pnpm icons:generate`.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const web = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

const TARGETS = [
  { source: "public/icons/icon.svg", size: 192, out: "public/icons/icon-192.png", transparent: true },
  { source: "public/icons/icon.svg", size: 512, out: "public/icons/icon-512.png", transparent: true },
  { source: "public/icons/icon-maskable.svg", size: 512, out: "public/icons/icon-maskable-512.png" },
  // iOS rounds the apple icon itself, so it comes from the full-bleed artwork.
  { source: "public/icons/icon-maskable.svg", size: 180, out: "src/app/apple-icon.png" },
];
const FAVICON_SIZES = [16, 32];

/** PNG-in-ICO: a 6 byte header, one 16 byte entry per image, then the PNG files themselves. */
function toIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const svgs = new Map();

  async function render(source, size, transparent) {
    if (!svgs.has(source)) svgs.set(source, await readFile(web(source)));
    const data = `data:image/svg+xml;base64,${svgs.get(source).toString("base64")}`;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;background:transparent"><img src="${data}" width="${size}" height="${size}" style="display:block"></body>`,
    );
    await page.waitForFunction(() => document.images[0].complete);
    return page.screenshot({ type: "png", omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  }

  for (const { source, size, out, transparent = false } of TARGETS) {
    await writeFile(web(out), await render(source, size, transparent));
    console.log(`${out} (${size}x${size})`);
  }

  const favicons = [];
  for (const size of FAVICON_SIZES) favicons.push({ size, png: await render("public/icons/icon.svg", size, true) });
  await writeFile(web("src/app/favicon.ico"), toIco(favicons));
  console.log(`src/app/favicon.ico (${FAVICON_SIZES.join("+")})`);
} finally {
  await browser.close();
}
