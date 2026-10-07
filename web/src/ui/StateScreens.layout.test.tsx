// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it , vi } from "vitest";
import messages from "../../messages/es-AR";
import { MeProvider } from "@/features/auth/MeProvider";
import { BudgetView } from "@/features/budget/containers/BudgetView";
import { DocumentVault } from "@/features/documents/containers/DocumentVault";
import { makeDocument } from "@/features/documents/test/handlers";
import { LogisticsBoard } from "@/features/logistics/containers/LogisticsBoard";
import { PackingList } from "@/features/logistics/containers/PackingList";
import { makeTask } from "@/features/logistics/test/handlers";
import { CREW_ID, PERSON_ID, TRIP_ID, makeMe, makeSummary, makeTrip } from "@/features/trips/fixtures";
import { TripList } from "@/features/trips/containers/TripList";
import { TripProvider } from "@/features/trips/TripProvider";
import { compiledCss } from "@/test/compiledCss";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const LONG = "Una descripción larguísima sin espacios para forzar el quiebre de línea en pantallas angostas ".repeat(2);

const budget = {
  currency: "ARS",
  participants: 5,
  participants_basis: "in",
  lines: [
    { proposal_id: "a", title: `Cabaña ${LONG}`, category: "lodging", status: "booked", price_basis: "total", original_amount: "480000", original_currency: "ARS", nights: 4, nights_assumed: true, amount: "480000", per_person: "96000" },
  ],
  by_category: { lodging: "480000" },
  committed: "480000",
  expected: "0",
  total: "480000",
  per_person: "96000",
  remainder: "0",
  unconverted: [{ proposal_id: "u", title: "Vuelos", category: "transport", status: "chosen", price_basis: "total", original_amount: "900", original_currency: "USD", nights: null, nights_assumed: false, amount: null, per_person: null }],
  missing_price: [{ proposal_id: "m", title: LONG, category: "activity", status: "chosen" }],
  fx_rates: { USD: "1200", EUR: "1300" },
  gastito_url: "https://gastito.example/g/1",
};

function render(children: React.ReactNode, seed: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(client);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="es-AR" messages={messages}>
      <QueryClientProvider client={client}>
        <MeProvider me={makeMe()}>
          <TripProvider trip={makeTrip()}>{children}</TripProvider>
        </MeProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const screens: Record<string, string> = {
  budget: render(<BudgetView tripId={TRIP_ID} crewId={CREW_ID} />, (client) =>
    client.setQueryData(["budget", TRIP_ID], budget),
  ),
  documents: render(<DocumentVault tripId={TRIP_ID} viewerId={PERSON_ID} />, (client) =>
    client.setQueryData(["documents", TRIP_ID, "list", "all"], [
      makeDocument({ id: "1", title: LONG, kind: "ticket", valid_until: "2027-07-01" }),
      makeDocument({ id: "2", title: "Seguro", kind: "insurance", visibility: "owner_only" }),
    ]),
  ),
  tasks: render(<LogisticsBoard tripId={TRIP_ID} />, (client) =>
    client.setQueryData(["logistics", TRIP_ID, "tasks", {}], [
      makeTask({ id: "1", title: LONG, overdue: true, due_on: "2027-06-20" }),
      makeTask({ id: "2", title: "Hecha", status: "done", number: 2 }),
    ]),
  ),
  packing: render(<PackingList tripId={TRIP_ID} />, (client) => {
    client.setQueryData(["logistics", TRIP_ID, "packing", "me"], {
      templates_available: [{ key: "generic", label: "Básica" }],
      applied: [],
      sections: [
        {
          key: "tech",
          label: "Tecnología",
          entries: [{ id: "e1", section: "tech", item_key: null, label: LONG, quantity: 2, packed: false, position: 0 }],
        },
      ],
      progress: { packed: 0, total: 1 },
    });
    client.setQueryData(["logistics", TRIP_ID, "packing", "summary"], [
      { person: { person_id: PERSON_ID, display_name: "Mateo" }, packed: 0, total: 1 },
    ]);
  }),
  trips: render(<TripList crewId={CREW_ID} />, (client) =>
    client.setQueryData(["trips", "crew", CREW_ID], [
      makeSummary({ name: LONG }),
      makeSummary({ id: "x", name: "Mendoza", start_on: null, end_on: null, status: "idea" }),
    ]),
  ),
  tripsWithCover: render(<TripList crewId={CREW_ID} />, (client) =>
    client.setQueryData(["trips", "crew", CREW_ID], [
      makeSummary({ name: LONG, has_cover: true, cover_version: 2 }),
      makeSummary({ id: "x", name: "Mendoza", has_cover: false, status: "idea" }),
    ]),
  ),
};

let browser: Browser;
let page: Page;
let css = "";

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  css = await compiledCss();
  await page.emulateMedia({ reducedMotion: "reduce" });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function show(name: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.setContent(`<body><main class="app-canvas mx-auto">${screens[name]}</main></body>`);
  await page.addStyleTag({ content: css });
}

for (const name of Object.keys(screens)) {
  it.each([320, 390])(`${name} does not overflow horizontally at %ipx, even with unbroken long text`, async (width) => {
    await show(name, width);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

it.each(["budget", "documents", "tasks", "packing"])("%s keeps every button, link and field at least 44px tall", async (name) => {
  await show(name, 320);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main button, main a, main select, main input:not([type=checkbox]):not([type=hidden])")]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && bounds.height < 44;
      })
      .map((element) => `${element.tagName}.${element.className} ${Math.round(element.getBoundingClientRect().height)}`),
  );

  expect(small).toEqual([]);
});

it("makes every checkbox sit in a 44px target", async () => {
  await show("tasks", 320);
  const targets = await page.locator(".ui-check").evaluateAll((labels) =>
    labels.map((label) => {
      const bounds = label.getBoundingClientRect();
      return [bounds.width, bounds.height];
    }),
  );

  expect(targets.length).toBeGreaterThan(0);
  for (const [width, height] of targets) {
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  }
});

it.each([320, 390])("keeps the ticket picture a 64px square and the trip name readable at %ipx", async (width) => {
  await show("tripsWithCover", width);

  const sizes = await page.locator(".trip-ticket-media").evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return [Math.round(bounds.width), Math.round(bounds.height)];
    }),
  );
  expect(sizes).toEqual([
    [64, 64],
    [64, 64],
  ]);
  const text = await page.locator(".trip-ticket-text").first().evaluate((element) => element.getBoundingClientRect().width);
  expect(text).toBeGreaterThanOrEqual(150);
});

it("puts the ticket stub under the trip on phones and beside it from 560px", async () => {
  const layout = () =>
    page.evaluate(() => {
      const main = document.querySelector(".trip-ticket-main")!.getBoundingClientRect();
      const stub = document.querySelector(".trip-ticket-stub")!.getBoundingClientRect();
      return { stubBelow: stub.top >= main.bottom - 1, stubBeside: stub.left >= main.right - 1 };
    });

  await show("tripsWithCover", 390);
  expect(await layout()).toEqual({ stubBelow: true, stubBeside: false });
  await show("tripsWithCover", 1280);
  expect(await layout()).toEqual({ stubBelow: false, stubBeside: true });
});

it("aligns every ticket stub at the same distance from the edge on wide screens", async () => {
  await show("tripsWithCover", 1280);

  const lefts = await page.locator(".trip-ticket-stub").evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().left)),
  );
  expect(new Set(lefts).size).toBe(1);
});
