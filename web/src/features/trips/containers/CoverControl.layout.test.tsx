// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { compiledCss } from "@/test/compiledCss";
import { cssContrast } from "@/test/contrast";
import { Button } from "@/ui/atoms/Button";
import { CameraIcon } from "@/ui/icons";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { BoardingPass } from "@/ui/organisms/BoardingPass";
import { InlineError } from "@/ui/molecules/InlineError";
import messages from "../../../../messages/es-AR";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const WIDE_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#d0d0d0"/></svg>');
const LONGEST_ERROR = Object.values(messages.trips.cover.errors).sort((a, b) => b.length - a.length)[0];

function hero(media: "photo" | "art", error: boolean) {
  return renderToStaticMarkup(
    <main className="app-canvas mx-auto">
      <BoardingPass
        media={
          media === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element -- static layout fixture
            <img className="trip-hero-photo" src={WIDE_PHOTO} alt="" />
          ) : (
            <TripCoverArt scene="road" />
          )
        }
        mediaAction={
          <>
            <Button variant="icon" aria-label={messages.trips.cover.change}>
              <CameraIcon size={22} aria-hidden="true" />
            </Button>
            {error && <InlineError message={LONGEST_ERROR} />}
          </>
        }
        countdown={{ value: "10", unit: "días", caption: "para salir" }}
        facts={[{ label: "Destino", value: "Bariloche" }]}
      />
    </main>,
  );
}

let browser: Browser;
let page: Page;
let css = "";

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  css = await compiledCss();
  await page.emulateMedia({ reducedMotion: "reduce" });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function show(media: "photo" | "art", error: boolean, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(`<body>${hero(media, error)}</body>`);
  await page.addStyleTag({ content: css });
}

const box = (selector: string) =>
  page.locator(selector).first().evaluate((element) => {
    const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
    return { left, top, right, bottom, width, height };
  });

it.each([320, 390, 1280])("keeps the camera button a 44px target in the media corner at %ipx", async (width) => {
  await show("photo", false, width);

  const button = await box(".trip-hero-media-action .ui-button");
  const media = await box(".trip-hero-media");
  expect(button.width).toBeGreaterThanOrEqual(44);
  expect(button.height).toBeGreaterThanOrEqual(44);
  expect(button.right).toBeLessThanOrEqual(media.right - 8 + 0.5);
  expect(button.top).toBeGreaterThanOrEqual(media.top + 8 - 0.5);
});

it.each([320, 390, 1280])("fits the longest error message in the visible picture, above the pass, at %ipx", async (width) => {
  await show("photo", true, width);

  const media = await box(".trip-hero-media");
  const pass = await box(".trip-pass");
  const error = await box(".trip-hero-media-action .ui-inline-error");
  const button = await box(".trip-hero-media-action .ui-button");
  expect(error.left).toBeGreaterThanOrEqual(media.left);
  expect(error.right).toBeLessThanOrEqual(media.right);
  expect(error.bottom).toBeLessThanOrEqual(media.bottom);
  // Below 900px the pass overlaps the picture: the message must not slide under it.
  if (width < 900) expect(error.bottom).toBeLessThanOrEqual(pass.top);
  expect(error.top).toBeGreaterThanOrEqual(media.top);
  expect(error.right).toBeLessThanOrEqual(button.left);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

it("makes the photo fill the same frame as the illustration", async () => {
  await show("photo", false, 390);
  const photo = await box(".trip-hero-media");
  const photoImage = await box(".trip-hero-photo");
  await show("art", false, 390);
  const art = await box(".trip-hero-media");
  const artImage = await box(".trip-cover-art");

  expect(photo.width).toBe(art.width);
  expect(photo.height).toBe(art.height);
  expect([photoImage.width, photoImage.height]).toEqual([photo.width, photo.height]);
  expect([artImage.width, artImage.height]).toEqual([art.width, art.height]);
});

it.each(["light", "dark"] as const)("paints the button on an opaque surface that reads over any picture in %s", async (scheme) => {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await show("photo", false, 390);

  const style = await page.locator(".trip-hero-media-action .ui-button").evaluate((element) => {
    const computed = getComputedStyle(element);
    return { background: computed.backgroundColor, color: computed.color };
  });

  expect(style.background).not.toMatch(/rgba|transparent/);
  expect(await cssContrast(style.color, style.background, page)).toBeGreaterThanOrEqual(4.5);
});
