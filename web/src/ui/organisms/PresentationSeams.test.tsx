// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import messages from "../../../messages/es-AR";
import { ShellHeader } from "@/features/auth/containers/ShellHeader";
import { ProposalsOverviewCard } from "@/features/proposals/containers/ProposalsOverviewCard";
import { ProposalFilters } from "@/features/proposals/components/ProposalFilters";
import { DEFAULT_FILTERS } from "@/features/proposals/api/proposals";

vi.mock("next/navigation", () => ({ useRouter: () => ({}), usePathname: () => "/", useParams: () => ({}) }));
vi.mock("@/features/auth/MeProvider", () => ({ useMe: () => ({ person: { display_name: "Mateo" }, crews: [] }) }));
vi.mock("@/features/push/containers/PushSubscriptionSync", () => ({ PushSubscriptionSync: () => null }));
vi.mock("@/features/proposals/hooks/queries", () => ({
  useProposalsSummary: () => ({
    data: { counts: { proposed: 1 }, top: [{ id: "proposal", title: "Lake hotel", tally: { score: 2 } }] },
    isPending: false,
    isError: false,
  }),
}));

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const css = (await readFile(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8"))
    .replace(/@import[^;]+;/g, "");
  await page.setContent(renderToStaticMarkup(
    <NextIntlClientProvider locale="es-AR" timeZone="America/Argentina/Buenos_Aires" messages={messages}>
      <ShellHeader />
      <ProposalsOverviewCard crewId="crew" tripId="trip" />
      <ProposalFilters filters={DEFAULT_FILTERS} onChange={() => {}} />
    </NextIntlClientProvider>,
  ));
  await page.addStyleTag({ content: css });
});
afterAll(async () => { await browser?.close(); });

it("puts the notifications icon button in the 1120px header, 44px square, with no loose link below it", async () => {
  const link = page.getByRole("link", { name: "Notificaciones" });
  const bounds = await link.boundingBox();
  const header = await page.locator("header").first().boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.y).toBeGreaterThanOrEqual(header!.y);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(header!.y + header!.height);
  expect(header?.width).toBe(1120);
  expect(await page.getByRole("navigation", { name: "Notificaciones" }).count()).toBe(0);
});
it("provides 44px overview links and a checkbox click wrapper", async () => {
  for (const name of ["Propuestas", "Lake hotel"]) {
    expect((await page.getByRole("link", { name, exact: true }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  const checkbox = page.getByRole("checkbox", { name: "Mostrar descartadas" });
  const wrapper = await checkbox.evaluate(element => {
    const rect = element.parentElement!.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(wrapper.width).toBeGreaterThanOrEqual(44);
  expect(wrapper.height).toBeGreaterThanOrEqual(44);
});
it("preserves notification/detail routes and keeps the wrappers in a 320px viewport", async () => {
  expect(await page.getByRole("link", { name: "Notificaciones" }).getAttribute("href")).toBe("/me/notifications");
  expect(await page.getByRole("link", { name: "Lake hotel" }).getAttribute("href")).toBe("/crews/crew/trips/trip/proposals/proposal");
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

it("lets the padded checkbox wrapper activate the same labelled native control", async () => {
  const checkbox = page.getByRole("checkbox", { name: "Mostrar descartadas" });
  const wrapper = await checkbox.evaluate(element => {
    const rect = element.parentElement!.getBoundingClientRect();
    return { x: rect.x, y: rect.y };
  });
  await page.mouse.click(wrapper.x + 2, wrapper.y + 2);
  expect(await checkbox.isChecked()).toBe(true);
});
