// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import messages from "../../messages/es-AR";
import { MeProvider } from "@/features/auth/MeProvider";
import { UploadDocumentForm } from "@/features/documents/containers/UploadDocumentForm";
import { makeMe } from "@/features/trips/fixtures";
import { compiledCss } from "@/test/compiledCss";
import { StatCard } from "./molecules/StatCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

function render(children: React.ReactNode, seed: (client: QueryClient) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(client);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="es-AR" messages={messages} timeZone="UTC">
      <QueryClientProvider client={client}>
        <MeProvider me={makeMe()}>{children}</MeProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const upload = render(<UploadDocumentForm tripId="t1" />);

const stat = (index: number) => (
  <li key={index}>
    <StatCard icon={<svg width="20" height="20" />} value="2" label="propuestas decididas" detail="ninguna abierta" progress={{ value: 1, label: "x" }} href="#" />
  </li>
);
const stats = (count: number) =>
  renderToStaticMarkup(
    <ul className="trip-stats">{Array.from({ length: count }, (_, index) => stat(index))}</ul>,
  );

/** The overview "Secciones" grid with the markup shapes the milestone cards really use. */
const modules = renderToStaticMarkup(
  <>
    <ul className="overview-module-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
      <li className="empty:hidden">
        <a href="#" className="flex h-full flex-col gap-1 rounded-xl border border-border bg-surface p-4">
          <span className="font-medium">Hoy</span>
          <span className="text-sm text-muted">Faltan 10 días</span>
        </a>
      </li>
      <li className="empty:hidden">
        <section className="ui-card bg-surface p-5 flex h-full flex-col gap-3">
          <h3 className="text-base font-semibold">
            <a href="#">Propuestas</a>
          </h3>
          <p className="text-sm text-muted">0 nuevas · 2 elegidas</p>
          <ul>
            <li>Clases de esquí</li>
            <li>Cabaña cerca del cerro</li>
            <li>Un tercer ítem para que la tarjeta quede alta</li>
          </ul>
        </section>
      </li>
      <li className="empty:hidden">
        <a href="#" className="group flex h-full min-h-11 flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
          <span className="flex items-center justify-between gap-3 font-medium">
            Ver en el mapa
            <span aria-hidden className="text-xl">
              ↗
            </span>
          </span>
          <span className="text-sm text-muted">0 lugares en el mapa</span>
        </a>
      </li>
      <li className="empty:hidden">
        <section className="ui-card bg-surface p-5">
          <h3>Logística</h3>
          <p>3 tareas vencidas · 3 tuyas</p>
        </section>
      </li>
      <li className="empty:hidden">
        <section className="ui-card bg-surface p-5 flex flex-col gap-3" aria-label="Documentos sin conexión">
          <h2 className="text-lg font-semibold">Documentos sin conexión</h2>
          <p className="text-sm text-muted">Todavía no hay documentos para guardar</p>
        </section>
      </li>
    </ul>
  </>,
);

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

async function show(html: string, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<body><main class="app-canvas mx-auto">${html}</main></body>`);
  await page.addStyleTag({ content: css });
}

it.each([1, 2, 3, 4])("fills the desktop stats row with %i cards, with no empty slot", async (count) => {
  await show(stats(count), 1280);
  const { lefts, rights, container } = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".trip-stats > li")].map((item) => item.getBoundingClientRect());
    const list = document.querySelector(".trip-stats")!.getBoundingClientRect();
    return {
      lefts: items.map((box) => Math.round(box.left)),
      rights: items.map((box) => Math.round(box.right)),
      container: { left: Math.round(list.left), right: Math.round(list.right) },
    };
  });

  expect(lefts[0]).toBe(container.left);
  expect(rights[count - 1]).toBe(container.right);
  expect(new Set(lefts).size).toBe(count);
});

it("lets an odd last stat card take the whole row on phones instead of an orphan slot", async () => {
  await show(stats(3), 390);
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll(".trip-stats > li")].map((item) => {
      const box = item.getBoundingClientRect();
      return { left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top) };
    }),
  );
  const list = await page.locator(".trip-stats").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: Math.round(box.left), right: Math.round(box.right) };
  });

  expect(boxes[0].top).toBe(boxes[1].top);
  expect(boxes[2].top).toBeGreaterThan(boxes[1].top);
  expect(boxes[2].left).toBe(list.left);
  expect(boxes[2].right).toBe(list.right);
});

it.each([390, 1280])("gives every Sections card one title size and weight, one padding and one radius at %ipx", async (width) => {
  await show(modules, width);
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".overview-module-grid > li > *")].map((card) => {
      const title = card.querySelector<HTMLElement>("h2, h3, :scope > span:first-child")!;
      const cardStyle = getComputedStyle(card);
      const titleStyle = getComputedStyle(title);
      return {
        size: titleStyle.fontSize,
        weight: titleStyle.fontWeight,
        padding: [cardStyle.paddingTop, cardStyle.paddingRight, cardStyle.paddingBottom, cardStyle.paddingLeft].join(" "),
        radius: cardStyle.borderTopLeftRadius,
        gap: cardStyle.rowGap,
      };
    }),
  );

  expect(cards).toHaveLength(5);
  for (const key of ["size", "weight", "padding", "radius", "gap"] as const) {
    expect(new Set(cards.map((card) => card[key])).size, key).toBe(1);
  }
  expect(parseInt(cards[0].weight, 10)).toBeGreaterThanOrEqual(600);
});

it("does not stretch a short Sections card to the height of its tall neighbour", async () => {
  await show(modules, 1280);
  const { grid, hoy, propuestas } = await page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>(".overview-module-grid > li > *")];
    return {
      grid: getComputedStyle(document.querySelector(".overview-module-grid")!).alignItems,
      hoy: items[0].getBoundingClientRect().height,
      propuestas: items[1].getBoundingClientRect().height,
    };
  });

  expect(grid).toBe("start");
  expect(hoy).toBeLessThan(propuestas - 20);
});

it("has no horizontal overflow in the Sections grid at 320px", async () => {
  await show(modules, 320);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

it("styles the document picker as a 44px button over a visually hidden but focusable input, and shows the chosen name", async () => {
  await show(upload, 390);
  const picker = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(".ui-file-input")!;
    const label = document.querySelector<HTMLElement>(".ui-file-trigger")!;
    const inputBox = input.getBoundingClientRect();
    const labelBox = label.getBoundingClientRect();
    return {
      inputDisplay: getComputedStyle(input).display,
      inputWidth: inputBox.width,
      labelHeight: labelBox.height,
      labelCursor: getComputedStyle(label).cursor,
      labelFor: label.getAttribute("for") === input.id,
      noFile: document.querySelector(".ui-file-name")!.textContent,
      overflow: document.documentElement.scrollWidth,
    };
  });

  expect(picker.inputDisplay).not.toBe("none");
  expect(picker.inputWidth).toBeLessThanOrEqual(1);
  expect(picker.labelHeight).toBeGreaterThanOrEqual(44);
  expect(picker.labelCursor).toBe("pointer");
  expect(picker.labelFor).toBe(true);
  expect(picker.noFile).toBe(messages.documents.noFile);
  expect(picker.overflow).toBeLessThanOrEqual(390);

  await page.locator(".ui-file-input").setInputFiles({ name: "pasaje-ida-con-un-nombre-larguisimo-sin-espacios.pdf", mimeType: "application/pdf", buffer: Buffer.from("x") });
  // The static markup has no React: the chosen name is covered by the component test, the layout by the empty text.
  expect(await page.locator(".ui-file-input").evaluate((input: HTMLInputElement) => input.files?.length)).toBe(1);
});

it("shows a focus ring on the label-button when the hidden input takes keyboard focus", async () => {
  await show(upload, 390);
  await page.keyboard.press("Tab");

  expect(await page.evaluate(() => document.activeElement?.className)).toContain("ui-file-input");
  const ring = await page.locator(".ui-file-trigger").evaluate((label) => {
    const style = getComputedStyle(label);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style).not.toBe("none");
  expect(ring.width).toBeGreaterThanOrEqual(2);
});

it("keeps the upload card free of horizontal overflow at 320px", async () => {
  await show(upload, 320);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
