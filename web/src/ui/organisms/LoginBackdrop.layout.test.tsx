// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import messages from "../../../messages/es-AR";
import { compiledCss } from "@/test/compiledCss";
import { worstTextContrast } from "@/test/frameContrast";
import { PhoneStep } from "@/ui/molecules/PhoneStep";
import { AmbientVideo } from "@/ui/molecules/AmbientVideo";
import { LoginBackdrop } from "./LoginBackdrop";
import { LoginCard } from "./LoginCard";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

function markup(withBackdrop = true) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="es-AR" messages={messages} timeZone="UTC">
      <main className="public-canvas mx-auto flex w-full flex-1 items-center justify-center p-5">
        {withBackdrop && (
          <LoginBackdrop
            brand={messages.app.name}
            media={<AmbientVideo src="/ambient/beach.0123456789.mp4" poster="/ambient/beach.0123456789.webp" play={false} />}
          />
        )}
        <LoginCard>
          <PhoneStep pending={false} errorMessage="Revisá el número e intentá de nuevo" onSubmit={() => {}} />
        </LoginCard>
      </main>
    </NextIntlClientProvider>,
  );
}

let browser: Browser;
let page: Page;
let css = "";

async function load(withBackdrop = true) {
  // The root layout makes html full height and body a flex column: the centered card depends on it.
  await page.setContent(`<html class="h-full"><body class="min-h-full flex flex-col">${markup(withBackdrop)}</body></html>`);
  await page.addStyleTag({ content: css });
}

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  css = await compiledCss();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

it.each([
  [320, 568],
  [390, 844],
  [1280, 800],
])("does not overflow horizontally at %ipx", async (width, height) => {
  await page.setViewportSize({ width, height });

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

it("is a fixed, inert, full-viewport layer below the card", async () => {
  await page.setViewportSize({ width: 390, height: 844 });

  const facts = await page.locator(".login-backdrop").evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const card = document.querySelector(".login-card")!.getBoundingClientRect();
    const hit = document.elementFromPoint(card.x + card.width / 2, card.y + 20);
    return {
      position: style.position,
      pointerEvents: style.pointerEvents,
      zIndex: Number(style.zIndex),
      ariaHidden: element.getAttribute("aria-hidden"),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      cardOnTop: Boolean(hit?.closest(".login-card")),
    };
  });

  expect(facts.position).toBe("fixed");
  expect(facts.pointerEvents).toBe("none");
  expect(facts.zIndex).toBeLessThan(0);
  expect(facts.ariaHidden).toBe("true");
  expect(facts.box).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  expect(facts.cardOnTop).toBe(true);
});

it("keeps the motif and the heading inside the viewport at 320 and 390", async () => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });

    const motif = await page.locator(".login-route svg").boundingBox();
    const heading = await page.locator(".login-card h1").boundingBox();
    for (const box of [motif, heading]) {
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  }
});

it("draws film grain from an inline SVG data URI, not a file", async () => {
  const image = await page.locator(".login-backdrop-grain").evaluate((element) => getComputedStyle(element).backgroundImage);

  expect(image).toMatch(/^url\("data:image\/svg\+xml,/);
  expect(image).toContain("feTurbulence");
});

it("darkens the footage with a scrim that is heaviest at the top", async () => {
  const scrim = await page.locator(".login-backdrop-scrim").evaluate((element) => getComputedStyle(element).backgroundImage);

  expect(scrim).toContain("linear-gradient");
  expect(scrim).toContain("radial-gradient");
});

it("shows the brand in the top corner on a tall screen, clear of the card, and drops it on a short one", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const brand = await page.locator(".login-brand").boundingBox();
  const card = await page.locator(".login-card").boundingBox();
  expect(brand!.width).toBeGreaterThan(0);
  expect(brand!.y + brand!.height).toBeLessThanOrEqual(card!.y);

  await page.setViewportSize({ width: 568, height: 320 });
  expect(await page.locator(".login-brand").evaluate((element) => getComputedStyle(element).display)).toBe("none");
});

it("floats a frosted card that stays at least 90% opaque", async () => {
  const card = await page.locator(".login-card").evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, blur: style.backdropFilter };
  });

  const alpha = Number(/\/\s*([\d.]+)\)/.exec(card.background)?.[1] ?? /rgba\(.*,\s*([\d.]+)\)/.exec(card.background)?.[1] ?? 1);
  expect(alpha).toBeGreaterThanOrEqual(0.9);
  expect(card.blur).toContain("blur");
});

it.each(["light", "dark"] as const)("keeps card text at WCAG AA in %s over a white or a black frame", async (scheme) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });

  for (const frame of ["rgb(255 255 255)", "rgb(0 0 0)"]) {
    await page.locator(".login-backdrop .ambient-media").evaluate((element, color) => {
      (element as HTMLElement).style.background = color;
      element.querySelector("img")!.style.display = "none";
    }, frame);

    const ratios = await worstTextContrast(page, [".login-card h1", ".login-card label", ".login-card .text-muted", ".login-card [role=alert]"]);
    for (const [selector, ratio] of Object.entries(ratios)) {
      expect(ratio, `${scheme} ${selector} over ${frame}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

it.each(["light", "dark"] as const)("keeps the brand at WCAG AA in %s over a white or a black frame", async (scheme) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });

  for (const frame of ["rgb(255 255 255)", "rgb(0 0 0)"]) {
    await page.locator(".login-backdrop .ambient-media").evaluate((element, color) => {
      (element as HTMLElement).style.background = color;
      element.querySelector("img")!.style.display = "none";
    }, frame);

    const ratios = await worstTextContrast(page, [".login-brand"]);
    expect(ratios[".login-brand"], `${scheme} brand over ${frame}`).toBeGreaterThanOrEqual(4.5);
  }
});

it("rises into place with motion allowed and stays put under reduced motion", async () => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  const animated = await page.locator(".login-card").evaluate((element) => getComputedStyle(element).animationName);
  expect(animated).toBe("login-rise");

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const frozen = await page.locator(".login-card").evaluate((element) => getComputedStyle(element).animationName);
  expect(frozen).toBe("none");
});

it("leaves the plain card untouched when there is no backdrop (no clip in the manifest)", async () => {
  await load(false);

  const card = await page.locator(".login-card").evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, blur: style.backdropFilter, animation: style.animationName };
  });
  expect(card.background).not.toMatch(/rgba|\//);
  expect(card.blur).toBe("none");
  expect(card.animation).toBe("none");

  await load();
});
