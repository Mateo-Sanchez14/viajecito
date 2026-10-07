// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { NextActions } from "@/features/trips/containers/NextActions";
import type { TripAction } from "@/features/trips/actions/types";
import { makeMe, makeTrip } from "@/features/trips/fixtures";
import { TripProvider } from "@/features/trips/TripProvider";
import { compiledCss } from "@/test/compiledCss";
import { cssContrast, textContrast } from "@/test/contrast";
import { CalendarBlankIcon, ListChecksIcon, UsersThreeIcon } from "@/ui/icons";
import messages from "../../../messages/es-AR";
import { NextActionRow } from "./NextActionRow";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const LONG = "Una tarea con un nombre larguísimo sin espacios para forzar el quiebre en pantallas angostas".repeat(2);

const rows: TripAction[] = [
  {
    key: "accent",
    order: 1,
    Component: () => (
      <NextActionRow icon={<UsersThreeIcon size={20} aria-hidden="true" />} title="Confirmá si venís" detail="Todavía no respondiste" href="#rsvp" />
    ),
  },
  {
    key: "warn",
    order: 2,
    Component: () => (
      <NextActionRow icon={<ListChecksIcon size={20} aria-hidden="true" />} title={LONG} detail={LONG} href="/logistics" tone="warn" />
    ),
  },
  {
    key: "neutral",
    order: 3,
    Component: () => <NextActionRow icon={<CalendarBlankIcon size={20} aria-hidden="true" />} title="Definan las fechas" href="/dates" tone="neutral" />,
  },
];
const silent: TripAction[] = [
  { key: "a", order: 1, Component: () => null },
  { key: "b", order: 2, Component: () => null },
];

function overview(actions: TripAction[]) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="es-AR" messages={messages} timeZone="UTC">
      <QueryClientProvider client={new QueryClient()}>
        <MeProvider me={makeMe()}>
          <TripProvider trip={makeTrip()}>
            <main className="app-canvas mx-auto">
              <div className="trip-overview">
                <div className="trip-hero">hero</div>
                <ul className="trip-stats">
                  <li>stats</li>
                </ul>
                <NextActions actions={actions} />
                <section className="overview-crew">crew</section>
                <section className="overview-modules">
                  <ul>
                    <li>modules</li>
                  </ul>
                </section>
              </div>
            </main>
          </TripProvider>
        </MeProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const pages = { rows: overview(rows), silent: overview(silent) };

let browser: Browser;
let page: Page;
let css = "";

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  css = await compiledCss();
  await page.emulateMedia({ reducedMotion: "reduce" });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function show(name: keyof typeof pages, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<body>${pages[name]}</body>`);
  await page.addStyleTag({ content: css });
}

const box = (selector: string) =>
  page.locator(selector).first().evaluate((element) => {
    const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
    return { top, right, bottom, left, width, height };
  });
const display = (selector: string) =>
  page.locator(selector).first().evaluate((element) => getComputedStyle(element).display);

it("hides the whole section, heading included, when every rule rendered nothing", async () => {
  await show("silent", 390);

  expect(await display(".next-actions")).toBe("none");
  expect(await page.getByRole("heading", { name: messages.trips.actions.title }).count()).toBe(0);
});

it("shows the section once one rule has a row", async () => {
  await show("rows", 390);

  expect(await display(".next-actions")).not.toBe("none");
  expect(await page.getByRole("heading", { name: messages.trips.actions.title }).isVisible()).toBe(true);
});

it("hides the list item of a silent rule while a neighbour speaks", async () => {
  await show("rows", 390);
  await page.evaluate(() => {
    const list = document.querySelector(".next-actions-list")!;
    list.insertAdjacentHTML("afterbegin", '<li class="empty:hidden"></li>');
  });

  expect(await page.locator(".next-actions-list > li:empty").first().evaluate((li) => getComputedStyle(li).display)).toBe("none");
});

it.each([320, 390])("keeps rows at least 56px and links at least 44px tall, with no overflow, at %ipx", async (width) => {
  await show("rows", width);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const heights = await page.locator(".next-action").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(heights).toHaveLength(3);
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(56);
  for (const link of await page.locator("a.next-action").all()) {
    expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});

it.each(["light", "dark"] as const)("keeps row text at WCAG AA and icon chips at 3:1 in %s", async (scheme) => {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await show("rows", 390);

  expect(await textContrast(page, ".next-action-title", ".next-action")).toBeGreaterThanOrEqual(4.5);
  expect(await textContrast(page, ".next-action-detail", ".next-action")).toBeGreaterThanOrEqual(4.5);
  for (const tone of ["accent", "warn", "neutral"]) {
    const chip = page.locator(`.next-action[data-tone="${tone}"] .next-action-icon`);
    const [color, background] = await chip.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.color, style.backgroundColor];
    });
    expect(await cssContrast(color, background, page), tone).toBeGreaterThanOrEqual(3);
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
});

it("stacks the sections in one column below 900px", async () => {
  await show("rows", 390);
  const actions = await box(".next-actions");
  const crew = await box(".overview-crew");

  expect(crew.top).toBeGreaterThanOrEqual(actions.bottom);
  expect(Math.round(crew.left)).toBe(Math.round(actions.left));
});

it("puts what is missing beside the crew from 900px, under the hero and the stats", async () => {
  await show("rows", 1280);
  const [hero, stats, actions, crew, modules] = await Promise.all(
    [".trip-hero", ".trip-stats", ".next-actions", ".overview-crew", ".overview-modules"].map(box),
  );

  expect(stats.top).toBeGreaterThanOrEqual(hero.bottom);
  expect(actions.top).toBeGreaterThanOrEqual(stats.bottom);
  expect(Math.round(crew.top)).toBe(Math.round(actions.top));
  expect(crew.left).toBeGreaterThan(actions.right - 1);
  expect(actions.width).toBeGreaterThan(crew.width);
  expect(modules.top).toBeGreaterThanOrEqual(Math.max(actions.bottom, crew.bottom));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});

it("gives the crew the full width from 900px when nothing is missing", async () => {
  await show("silent", 1280);
  const crew = await box(".overview-crew");
  const hero = await box(".trip-hero");

  expect(Math.round(crew.width)).toBe(Math.round(hero.width));
});
