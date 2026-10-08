// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { compiledCss } from "@/test/compiledCss";
import { textContrast } from "@/test/contrast";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { TripCard, type TripCardPill } from "./TripCard";
import { TripSection } from "./TripSection";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const LONG = "Vacaciones larguísimas de invierno en la Patagonia argentina y chilena 2027 con todos";
const FACES = ["Ana", "Beto", "Cami", "Dani"];

const card = (name: string, index: number, pill?: TripCardPill, variant: "card" | "compact" = "card") => (
  <li key={`${name}-${index}`}>
    <TripCard
      index={index}
      variant={variant}
      href="/crews/c/trips/t"
      name={name}
      destination="Bariloche, Río Negro"
      dates="1 jul 2027 al 8 jul 2027"
      media={<TripCoverArt scene="snow" />}
      pill={pill}
      status={{ label: "Planificando", variant: "neutral" }}
      people={{ names: FACES, total: 7, label: "7 personas" }}
    />
  </li>
);

const quiet: TripCardPill = { content: "en 12 días", tone: "quiet" };
const live: TripCardPill = { content: "En curso", tone: "live" };

function markup(name = "Bariloche 2027") {
  return renderToStaticMarkup(
    <main className="app-canvas mx-auto">
      <TripSection title="Próximos" level={3} layout="rail">
        {[card(name, 0, quiet), card("Mendoza", 1, live), card("Pinamar", 2), card("Salta", 3, quiet), card("Lima", 4, quiet)]}
      </TripSection>
      <TripSection title="Pasados" level={3} layout="list" muted>
        {[card("Pinamar 2026", 5, { content: "Terminado", tone: "quiet" }, "compact"), card("Ushuaia", 6, undefined, "compact")]}
      </TripSection>
    </main>,
  );
}

let browser: Browser;
let page: Page;
let css = "";

async function show(width: number, name?: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(`<body>${markup(name)}</body>`);
  await page.addStyleTag({ content: css });
}

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  css = await compiledCss();
  await page.emulateMedia({ reducedMotion: "reduce" });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);

it.each([320, 390, 768, 1280])("does not overflow horizontally at %ipx", async (width) => {
  await show(width);

  expect(await pageWidth()).toBeLessThanOrEqual(width);
});

it("wraps a very long trip name at 320px without overflow and keeps the whole text", async () => {
  await show(320, LONG);

  expect(await pageWidth()).toBeLessThanOrEqual(320);
  expect(await page.locator(".trip-card-title").first().textContent()).toBe(LONG);
  const box = await page.locator(".trip-card").first().boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});

it.each([320, 390])("scrolls the upcoming cards in a snapping rail at %ipx, with the next card peeking", async (width) => {
  await show(width);

  const rail = await page.locator(".trip-rail").evaluate((element) => {
    const style = getComputedStyle(element);
    const items = [...element.children].map((item) => item.getBoundingClientRect());
    return {
      overflowX: style.overflowX,
      snapType: style.scrollSnapType,
      scrollable: element.scrollWidth > element.clientWidth,
      first: { left: items[0].left, right: items[0].right },
      second: { left: items[1].left, right: items[1].right },
      snapAlign: getComputedStyle(element.children[0]).scrollSnapAlign,
    };
  });

  expect(rail.overflowX).toBe("auto");
  expect(rail.snapType).toContain("x");
  expect(rail.snapType).toContain("mandatory");
  expect(rail.snapAlign).toContain("start");
  expect(rail.scrollable).toBe(true);
  // The first card starts at the page gutter and the second one shows its leading edge.
  expect(rail.first.left).toBeGreaterThanOrEqual(19);
  expect(rail.first.left).toBeLessThanOrEqual(25);
  expect(rail.second.left).toBeLessThan(width - 16);
  expect(rail.second.right).toBeGreaterThan(width);
});

it("lets the rail bleed to the screen edges on phones", async () => {
  await show(390);

  const box = await page.locator(".trip-rail").boundingBox();
  expect(box!.x).toBe(0);
  expect(Math.round(box!.width)).toBe(390);
});

it("turns the rail into a grid of 280px-plus columns from 768px", async () => {
  await show(1280);

  const grid = await page.locator(".trip-rail").evaluate((element) => {
    const style = getComputedStyle(element);
    const items = [...element.children].map((item) => item.getBoundingClientRect());
    return {
      display: style.display,
      overflowX: style.overflowX,
      snapType: style.scrollSnapType,
      columns: new Set(items.map((box) => Math.round(box.left))).size,
      minWidth: Math.min(...items.map((box) => box.width)),
      scrollable: element.scrollWidth > element.clientWidth,
    };
  });

  expect(grid.display).toBe("grid");
  expect(grid.overflowX).toBe("visible");
  expect(grid.snapType).toBe("none");
  expect(grid.columns).toBeGreaterThanOrEqual(3);
  expect(grid.minWidth).toBeGreaterThanOrEqual(280);
  expect(grid.scrollable).toBe(false);
});

it.each([390, 1280])("keeps the picture on top and the caption below it at %ipx", async (width) => {
  await show(width);

  const geometry = await page.locator(".trip-card").first().evaluate((element) => {
    const media = element.querySelector(".trip-card-media")!.getBoundingClientRect();
    const body = element.querySelector(".trip-card-body")!.getBoundingClientRect();
    return { mediaBottom: media.bottom, bodyTop: body.top, ratio: media.width / media.height };
  });

  expect(geometry.bodyTop).toBeGreaterThanOrEqual(geometry.mediaBottom - 1);
  expect(geometry.ratio).toBeGreaterThan(1.4);
  expect(geometry.ratio).toBeLessThan(1.8);
});

it("makes the whole card a tall tap target and the compact row at least 44px", async () => {
  await show(390);

  const heights = await page.locator(".trip-card").evaluateAll((cards) =>
    cards.map((element) => [element.getAttribute("data-variant"), element.getBoundingClientRect().height] as const),
  );
  for (const [variant, height] of heights) {
    expect(height, String(variant)).toBeGreaterThanOrEqual(variant === "compact" ? 44 : 200);
  }
});

it("lays the past trips out as muted compact rows with the picture beside the text", async () => {
  await show(390);

  const row = await page.locator(".trip-compact-list .trip-card").first().evaluate((element) => {
    const media = element.querySelector(".trip-card-media")!.getBoundingClientRect();
    const body = element.querySelector(".trip-card-body")!.getBoundingClientRect();
    return {
      flow: getComputedStyle(element).flexDirection,
      beside: body.left >= media.right - 1,
      mediaWidth: media.width,
      filter: getComputedStyle(element.querySelector(".trip-card-media")!).filter,
      foot: element.querySelector(".trip-card-foot"),
    };
  });

  expect(row.flow).toBe("row");
  expect(row.beside).toBe(true);
  expect(Math.round(row.mediaWidth)).toBe(88);
  expect(row.filter).toContain("grayscale");
  expect(row.foot).toBeNull();
});

it("draws the avatar stack as overlapping circles with the count in words beside it", async () => {
  await show(390);

  const stack = await page.locator(".avatar-stack").first().evaluate((element) => {
    const faces = [...element.querySelectorAll(".avatar-stack-face, .avatar-stack-more")].map((face) => face.getBoundingClientRect());
    const label = element.querySelector(".avatar-stack-label")!.getBoundingClientRect();
    return {
      count: faces.length,
      overlaps: faces.slice(1).every((box, index) => box.left < faces[index].right),
      sizes: [...new Set(faces.map((box) => Math.round(box.width)))],
      radius: getComputedStyle(element.querySelector(".avatar-stack-face")!).borderTopLeftRadius,
      labelAfter: label.left >= faces[faces.length - 1].right,
    };
  });

  expect(stack.count).toBe(5); // four faces plus "+3"
  expect(stack.overlaps).toBe(true);
  expect(stack.sizes).toEqual([28]);
  expect(stack.radius).toBe("50%");
  expect(stack.labelAfter).toBe(true);
});

it.each(["light", "dark"] as const)("keeps every caption and pill at WCAG AA in %s", async (scheme) => {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await show(390);

  for (const [text, backdrop] of [
    [".trip-card-title", ".trip-card-body"],
    [".trip-card-meta", ".trip-card-body"],
    [".trip-card-dates", ".trip-card-body"],
    [".avatar-stack-label", ".trip-card-body"],
    [".trip-card-pill[data-tone='quiet']", ".trip-card-pill[data-tone='quiet']"],
    [".trip-card-pill[data-tone='live']", ".trip-card-pill[data-tone='live']"],
    [".trip-compact-list .trip-card-pill", ".trip-compact-list .trip-card-pill"],
    [".trip-section-title", "body"],
  ]) {
    expect(await textContrast(page, text, backdrop), `${scheme} ${text}`).toBeGreaterThanOrEqual(4.5);
  }
  // The caption panel paints its own opaque surface: no picture ever sits under the text.
  const background = await page.locator(".trip-card-body").first().evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).not.toMatch(/rgba|transparent/);

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
});

it("gives the pill an opaque surface of its own, so it never depends on the picture", async () => {
  await show(390);

  const backgrounds = await page.locator(".trip-card-pill").evaluateAll((pills) =>
    pills.map((pill) => getComputedStyle(pill).backgroundColor),
  );
  for (const background of backgrounds) expect(background).not.toMatch(/rgba|transparent/);
});

it("staggers the entrance through --i and does not animate under reduced motion", async () => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await show(1280);
  const delays = await page.locator(".trip-card").evaluateAll((cards) =>
    cards.slice(0, 4).map((element) => getComputedStyle(element).animationDelay),
  );
  expect(delays).toEqual(["0s", "0.045s", "0.09s", "0.135s"]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const names = await page.locator(".trip-card").first().evaluate((element) => getComputedStyle(element).animationName);
  expect(names).toBe("none");
});
