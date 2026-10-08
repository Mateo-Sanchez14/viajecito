// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import messages from "../../../../messages/es-AR";
import { MeProvider } from "@/features/auth/MeProvider";
import { compiledCss } from "@/test/compiledCss";
import { textContrast } from "@/test/contrast";
import { CREW_ID, makeMe, makeSummary } from "../fixtures";
import { CreateTripForm } from "./CreateTripForm";
import { CrewTrips } from "./CrewTrips";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const LONG = "Vacaciones larguísimas de invierno en la Patagonia argentina y chilena 2027 con todos";
const OTHER_CREW = "55555555-5555-4555-8555-555555555555";

function render(children: React.ReactNode, seed: (client: QueryClient) => void = () => {}, me = makeMe()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(client);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="es-AR" messages={messages} timeZone="UTC">
      <QueryClientProvider client={client}>
        <MeProvider me={me}>{children}</MeProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const trips = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    makeSummary({ id: `trip-${index}`, name: index === 0 ? LONG : `Viaje ${index}`, start_on: `2027-0${(index % 8) + 1}-10`, end_on: `2027-0${(index % 8) + 1}-14` }),
  );

const home = render(<CrewTrips />, (client) => client.setQueryData(["trips", "crew", CREW_ID], trips(7)));
const crewTwo = { id: OTHER_CREW, name: "Familia", role: "member" as const, gastito_group_url: null, default_trip_id: null };
const multi = render(
  <CrewTrips />,
  (client) => {
    client.setQueryData(["trips", "crew", CREW_ID], trips(2));
    client.setQueryData(["trips", "crew", OTHER_CREW], []);
  },
  makeMe({ crews: [...makeMe().crews, crewTwo] }),
);
const form = render(
  <div className="ui-sheet-panel" style={{ maxHeight: "none", overflow: "visible" }}>
    <CreateTripForm crewId={CREW_ID} />
  </div>,
);

let browser: Browser;
let page: Page;
let css = "";

async function show(html: string, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<body><main class="app-canvas mx-auto">${html}</main></body>`);
  await page.addStyleTag({ content: css });
}

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  css = await compiledCss();
  await page.emulateMedia({ reducedMotion: "reduce" });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);

it.each([320, 390, 1280])("lays the home out without horizontal overflow at %ipx", async (width) => {
  await show(home, width);

  expect(await pageWidth()).toBeLessThanOrEqual(width);
});

it.each([320, 390, 1280])("puts the title and the 44px new-trip button on one row at %ipx", async (width) => {
  await show(home, width);

  const row = await page.evaluate(() => {
    const head = document.querySelector(".home-trips-head")!.getBoundingClientRect();
    const title = document.querySelector(".home-title")!.getBoundingClientRect();
    const button = document.querySelector(".home-trips-head .ui-button")!.getBoundingClientRect();
    return { head, title, button, auto: getComputedStyle(document.querySelector(".home-trips-head .ui-button")!).width };
  });

  expect(row.button.height).toBeGreaterThanOrEqual(44);
  expect(row.button.right).toBeLessThanOrEqual(width);
  expect(row.button.left).toBeGreaterThanOrEqual(row.title.right - 1);
  expect(Math.abs(row.button.top + row.button.height / 2 - (row.title.top + row.title.height / 2))).toBeLessThanOrEqual(2);
  // An inline action, not the full-width primary button.
  expect(row.button.width).toBeLessThan(width / 2);
});

it("keeps the page title modest next to the group titles, not louder than the hero", async () => {
  await show(home, 390);

  const sizes = await page.evaluate(() => ({
    title: parseFloat(getComputedStyle(document.querySelector(".home-title")!).fontSize),
    group: parseFloat(getComputedStyle(document.querySelector(".trip-section-title")!).fontSize),
  }));

  expect(sizes.title).toBeLessThanOrEqual(24);
  expect(sizes.title).toBeGreaterThan(sizes.group);
});

it("gives every crew its own row with the crew name and a button when there are several", async () => {
  await show(multi, 390);

  const rows = await page.locator(".home-trips-head").evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent,
      button: element.querySelector(".ui-button")!.getBoundingClientRect().height,
    })),
  );

  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.text)).toEqual([expect.stringContaining("Los Pibes"), expect.stringContaining("Familia")]);
  for (const row of rows) expect(row.button).toBeGreaterThanOrEqual(44);
  expect(await pageWidth()).toBeLessThanOrEqual(390);
});

it.each(["light", "dark"] as const)("keeps the home titles and the new-trip button at WCAG AA in %s", async (scheme) => {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await show(home, 390);

  expect(await textContrast(page, ".home-title", "body")).toBeGreaterThanOrEqual(4.5);
  expect(await textContrast(page, ".trip-section-title", "body")).toBeGreaterThanOrEqual(4.5);
  expect(await textContrast(page, ".home-trips-head .ui-button", ".home-trips-head .ui-button")).toBeGreaterThanOrEqual(4.5);

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
});

it("hides the header greeting on a page with the landing hero, and only there", async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const header = '<header><span class="app-greeting">Hola, Mateo</span></header>';

  await page.setContent(`<body>${header}<section class="landing-hero"></section></body>`);
  await page.addStyleTag({ content: css });
  expect(await page.locator(".app-greeting").evaluate((element) => getComputedStyle(element).display)).toBe("none");

  await page.setContent(`<body>${header}<main></main></body>`);
  await page.addStyleTag({ content: css });
  expect(await page.locator(".app-greeting").evaluate((element) => getComputedStyle(element).display)).not.toBe("none");
});

// --- the new-trip form -------------------------------------------------------------------------

it("does not overflow the new-trip form at 320px", async () => {
  await show(form, 320);

  expect(await pageWidth()).toBeLessThanOrEqual(320);
});

it.each([320, 1280])("asks where first, then the dates, then the name, at %ipx", async (width) => {
  await show(form, width);

  const tops = await page.evaluate(() => {
    const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
    return {
      destination: top("input[id$='-destination']"),
      start: top("input[id$='-start']"),
      name: top("input[id$='-name']"),
      more: top(".create-trip-more"),
    };
  });

  expect(tops.destination).toBeLessThan(tops.start);
  expect(tops.start).toBeLessThan(tops.name);
  expect(tops.name).toBeLessThan(tops.more);
});

it("keeps every visible control and the 'more options' summary at least 44px tall", async () => {
  await show(form, 320);

  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".create-trip-form input, .create-trip-form button, .create-trip-form summary")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.height < 44;
      })
      .map((element) => `${element.tagName} ${Math.round(element.getBoundingClientRect().height)}`),
  );

  expect(small).toEqual([]);
});

it("hides type and currency until 'more options' opens, then shows them at 44px", async () => {
  await show(form, 390);
  const visible = (selector: string) =>
    page.locator(selector).evaluate((element) => {
      // A closed <details> hides its content with content-visibility, which still reports a box.
      const shown = element.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
      return shown ? element.getBoundingClientRect().height : 0;
    });

  expect(await visible("select")).toBe(0);
  expect(await visible("input[id$='-currency']")).toBe(0);

  await page.locator(".create-trip-more > summary").click();

  expect(await visible("select")).toBeGreaterThanOrEqual(44);
  expect(await visible("input[id$='-currency']")).toBeGreaterThanOrEqual(44);
  expect(await pageWidth()).toBeLessThanOrEqual(390);
});

it("turns the 'more options' caret when open and keeps the summary on one line", async () => {
  await show(form, 320);
  const summary = page.locator(".create-trip-more > summary");
  const lines = () => summary.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element.lastChild!);
    return Math.round(range.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight || "20"));
  });
  expect(await lines()).toBeLessThanOrEqual(1);

  await summary.click();

  const transform = await page.locator(".create-trip-more > summary > svg").evaluate((element) => getComputedStyle(element).transform);
  expect(transform).not.toBe("none");
});
