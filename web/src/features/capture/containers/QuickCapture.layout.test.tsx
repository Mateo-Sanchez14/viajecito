// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { BottomNav, type BottomNavItem } from "@/ui/molecules/BottomNav";
import { PlusIcon } from "@/ui/icons";
import { compiledCss } from "@/test/compiledCss";
import { textContrast } from "@/test/contrast";
import messages from "../../../../messages/es-AR";
import { CaptureMenu } from "../components/CaptureMenu";
import { CaptureToast } from "../components/CaptureToast";
import { IdeaCaptureForm } from "../components/IdeaCaptureForm";
import { LinkCaptureForm } from "../components/LinkCaptureForm";
import { TaskCaptureForm } from "../components/TaskCaptureForm";
import { TripChooser } from "../components/TripChooser";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const noop = () => {};
const icon = <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" />;
const item = (key: string, label: string): BottomNavItem => ({ key, label, href: `/t/${key}`, active: false, icon });
const NAV = [item("overview", "Resumen"), item("proposals", "Propuestas"), item("logistics", "Logística"), item("itinerary", "Itinerario")];

function wrap(children: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="es-AR" messages={messages} timeZone="UTC">
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const fab = (
  <button type="button" className="quick-capture-fab" aria-haspopup="dialog">
    <PlusIcon size={24} aria-hidden="true" />
    <span className="quick-capture-label">{messages.capture.trigger}</span>
  </button>
);

const tripPage = (content: React.ReactNode = "contenido") =>
  wrap(
    <>
      <main className="app-canvas mx-auto">{content}</main>
      <BottomNav label="Menú del viaje" items={NAV} />
      {fab}
    </>,
  );

const pages = {
  trip: tripPage(),
  home: wrap(
    <>
      <main className="app-canvas mx-auto">contenido</main>
      {fab}
    </>,
  ),
};

const toast = wrap(
  <div className="capture-toast-region" role="status">
    <CaptureToast toast={{ message: "Tarea agregada", href: "/x" }} onDismiss={noop} />
  </div>,
);

const sheet = (children: React.ReactNode) =>
  wrap(
    <dialog className="ui-sheet" open>
      <div className="ui-sheet-panel">
        <div className="ui-sheet-body">{children}</div>
      </div>
    </dialog>,
  );

const sheets = {
  menu: sheet(<CaptureMenu onPick={noop} />),
  link: sheet(<LinkCaptureForm tripId="t" onBack={noop} onCreated={noop} onNavigate={noop} />),
  idea: sheet(<IdeaCaptureForm tripId="t" defaultCurrency="USD" onBack={noop} onCreated={noop} />),
  task: sheet(<TaskCaptureForm tripId="t" onBack={noop} onCreated={noop} />),
  chooser: sheet(
    <>
      <TripChooser
        options={[
          { crewId: "a", crewName: "Grupo con un nombre larguísimo que tiene que entrar igual", tripId: "1" },
          { crewId: "b", crewName: "Familia", tripId: "2" },
        ]}
        value=""
        onChange={noop}
      />
      <TaskCaptureForm tripId={null} onBack={noop} onCreated={noop} />
    </>,
  ),
};

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

async function show(html: string, width: number, height = 844) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<body>${html}</body>`);
  await page.addStyleTag({ content: css });
}

const box = (selector: string) =>
  page.locator(selector).first().evaluate((element) => {
    const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
    return { top, right, bottom, left, width, height };
  });

it("keeps the trigger at least 44x44, inside the screen and above the bottom nav at 390px", async () => {
  await show(pages.trip, 390);
  const trigger = await box(".quick-capture-fab");
  const nav = await box(".bottom-nav");

  expect(trigger.width).toBeGreaterThanOrEqual(44);
  expect(trigger.height).toBeGreaterThanOrEqual(44);
  expect(trigger.right).toBeLessThanOrEqual(390);
  expect(trigger.bottom).toBeLessThanOrEqual(nav.top);
});

it("does not overlap any bottom-nav item at 320px and 390px", async () => {
  for (const width of [320, 390]) {
    await show(pages.trip, width);
    const trigger = await box(".quick-capture-fab");
    const items = await page.locator(".bottom-nav-item").evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().top),
    );

    for (const top of items) expect(trigger.bottom).toBeLessThanOrEqual(top);
  }
});

it("stacks the trigger above the nav and the toast above the trigger", async () => {
  await show(pages.trip + toast, 390);
  const [navZ, fabZ, toastZ] = await Promise.all(
    [".bottom-nav", ".quick-capture-fab", ".capture-toast-region"].map((selector) =>
      page.locator(selector).first().evaluate((element) => Number(getComputedStyle(element).zIndex)),
    ),
  );
  const trigger = await box(".quick-capture-fab");
  const toastBox = await box(".capture-toast");

  expect(fabZ).toBeGreaterThan(navZ);
  expect(toastZ).toBeGreaterThan(fabZ);
  expect(toastBox.bottom).toBeLessThanOrEqual(trigger.top);
});

it("sits near the corner on home, where there is no bottom nav", async () => {
  await show(pages.home, 390);
  const trigger = await box(".quick-capture-fab");

  expect(844 - trigger.bottom).toBe(16);
});

it("shows only the icon until the gutter fits the pill, then an extended pill with its name", async () => {
  await show(pages.trip, 390);
  expect((await box(".quick-capture-fab")).width).toBe(56);
  expect((await box(".quick-capture-label")).width).toBeLessThanOrEqual(1);

  await show(pages.trip, 1280, 900);
  expect((await box(".quick-capture-fab")).width).toBe(56);
  expect(await page.getByRole("button", { name: "Agregar rápido" }).count()).toBe(1);

  await show(pages.trip, 1600, 900);
  const pill = await box(".quick-capture-fab");
  expect(pill.width).toBeGreaterThan(56);
  expect((await box(".quick-capture-label")).width).toBeGreaterThan(40);
  expect(await page.getByRole("button", { name: "Agregar rápido" }).count()).toBe(1);
});

/** A page whose rows end in edit/delete-style buttons flush with the right edge of the content column. */
const rowsPage = (rows = 30) =>
  tripPage(
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minHeight: 64 }}>
          <a href={`/t/${index}`}>Tarea {index}</a>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" style={{ width: 44, height: 44 }}>
              Editar
            </button>
            <button type="button" style={{ width: 44, height: 44 }}>
              Borrar
            </button>
          </span>
        </li>
      ))}
    </ul>,
  );

/** Interactive controls of the page content that the trigger covers at the current scroll position. */
const coveredControls = () =>
  page.evaluate(() => {
    const fab = document.querySelector(".quick-capture-fab")!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>("main a, main button, main input, main select, main textarea")]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.width > 0 &&
          bounds.left < fab.right &&
          bounds.right > fab.left &&
          bounds.top < fab.bottom &&
          bounds.bottom > fab.top
        );
      })
      .map((element) => `${element.tagName} ${element.textContent}`);
  });

// Below 1264px there is no gutter: the icon floats over the page edge by design, like any phone FAB.
it.each([1280, 1440, 1600, 1920])("never covers a control of the content column at %ipx, at any scroll position", async (width) => {
  await show(rowsPage(), width, 900);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);

  for (let top = 0; top <= height; top += 150) {
    await page.evaluate((y) => window.scrollTo(0, y), top);
    expect(await coveredControls()).toEqual([]);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await coveredControls()).toEqual([]);
});

it("keeps the trigger inside the gutter, clear of the 1120px column, at 1280px and 1600px", async () => {
  for (const width of [1280, 1600]) {
    await show(pages.trip, width, 900);
    const trigger = await box(".quick-capture-fab");
    const canvas = await box(".app-canvas");

    expect(trigger.left).toBeGreaterThanOrEqual(canvas.right);
    expect(trigger.right).toBeLessThanOrEqual(width);
  }
});

it.each([390, 320])("leaves no control under the trigger once the page is scrolled to its end at %ipx", async (width) => {
  await show(rowsPage(), width);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  expect(await coveredControls()).toEqual([]);
});

it("keeps the last interactive element clear of the trigger and the nav below md", async () => {
  await show(
    tripPage(
      <>
        <div style={{ height: 1800 }}>contenido largo</div>
        <a id="last-link" href="/fin">
          Último enlace
        </a>
      </>,
    ),
    390,
  );
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const { last, fabTop, navTop } = await page.evaluate(() => ({
    last: document.getElementById("last-link")!.getBoundingClientRect().bottom,
    fabTop: document.querySelector(".quick-capture-fab")!.getBoundingClientRect().top,
    navTop: document.querySelector(".bottom-nav")!.getBoundingClientRect().top,
  }));
  expect(last).toBeLessThanOrEqual(Math.min(fabTop, navTop));
});

for (const name of Object.keys(sheets) as (keyof typeof sheets)[]) {
  it.each([320, 390])(`${name} sheet content does not overflow horizontally at %ipx`, async (width) => {
    await show(sheets[name], width);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const overflowing = await page.evaluate(() => {
      const panel = document.querySelector(".ui-sheet-panel")!.getBoundingClientRect();
      return [...document.querySelectorAll(".ui-sheet-body *")]
        .filter((element) => element.getBoundingClientRect().right > panel.right + 0.5)
        .map((element) => element.tagName + "." + element.className);
    });
    expect(overflowing).toEqual([]);
  });
}

it.each(Object.keys(sheets))("%s sheet keeps every button, link and field at least 44px tall at 320px", async (name) => {
  await show(sheets[name as keyof typeof sheets], 320);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".ui-sheet-body button, .ui-sheet-body a, .ui-sheet-body select, .ui-sheet-body input")]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && bounds.height < 44;
      })
      .map((element) => `${element.tagName}.${element.className} ${Math.round(element.getBoundingClientRect().height)}`),
  );

  expect(small).toEqual([]);
});

it.each(["light", "dark"] as const)("keeps the trigger and the toast text at WCAG AA in %s", async (scheme) => {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await show(wrap(fab) + toast, 390);

  expect(await textContrast(page, ".quick-capture-fab", ".quick-capture-fab")).toBeGreaterThanOrEqual(4.5);
  expect(await textContrast(page, ".capture-toast p", ".capture-toast")).toBeGreaterThanOrEqual(4.5);
  expect(await textContrast(page, ".capture-toast-link", ".capture-toast")).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
});

it("gives the toast link a 44px target", async () => {
  await show(toast, 320);

  expect((await box(".capture-toast-link")).height).toBeGreaterThanOrEqual(44);
});
