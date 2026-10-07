// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Button } from "./Button";
import { Card } from "./Card";
import { Input } from "./Input";
import { Skeleton } from "./Skeleton";
import { SectionNav } from "../molecules/SectionNav";

let browser: Browser;
let page: Page;
let css = "";
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // Exercise the actual authored stylesheet in a real browser, never CSS-class snapshots.
  css = (await readFile(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8"))
    .replace(/@import[^;]+;/g, "");
  await page.setContent(renderToStaticMarkup(<main>
    <Button variant="link">Continue</Button>
    <Button disabled>Saving</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="destructive">Destructive</Button>
    <Button variant="icon" aria-label="Close icon">x</Button>
    <Card data-testid="card">Card</Card>
    <span data-testid="tabular" className="ui-tabular">1234</span>
    <label>
      Phone
      <Input type="tel" invalid />
    </label>
    <SectionNav
      label="Trip"
      items={[
        { key: "overview", href: "/trip", label: "Overview", active: true },
        { key: "proposals", href: "/proposals", label: "Proposals", active: false },
      ]}
    />
    <Skeleton data-testid="skeleton" />
  </main>));
  await page.addStyleTag({ content: css });
});
afterAll(async () => {
  await browser?.close();
});

it("keeps link-style controls and navigation at least 44px tall on a phone", async () => {
  const controls = [
    page.getByRole("button", { name: "Continue" }),
    page.getByRole("link", { name: "Overview" }),
    page.getByRole("link", { name: "Proposals" }),
  ];
  for (const control of controls) {
    const bounds = await control.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
});
it("provides a strong keyboard focus indicator and preserves disabled/invalid semantics", async () => {
  const button = page.getByRole("button", { name: "Continue"});
  await button.focus();
  const focus = await button.evaluate(element => {
    const style = getComputedStyle(element);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
  });
  expect(focus.width).toBeGreaterThanOrEqual(2);
  expect(focus.style).toBe("solid");
  expect(await page.getByRole("button", { name: "Saving"}).isDisabled()).toBe(true);
  expect(await page.getByRole("textbox",{ name: "Phone"}).getAttribute("aria-invalid")).toBe("true");
});
it("animates loading placeholders normally but removes animation for reduced motion", async () => {
  const skeleton = page.getByTestId("skeleton");
  await page.emulateMedia({ reducedMotion: "no-preference"});
  expect(await skeleton.evaluate(element => getComputedStyle(element).animationName)).not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce"});
  expect(await skeleton.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
});

it("keeps inactive navigation text at WCAG AA contrast against its actual tray", async () => {
  await page.emulateMedia({ colorScheme: "light" });
  const contrast = await page.getByRole("link", { name: "Proposals" }).evaluate((element) => {
    const luminance = (color: string) => {
      // Canvas resolves computed color() and color-mix() values into sRGB bytes.
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const values = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const text = luminance(getComputedStyle(element).color);
    const background = luminance(getComputedStyle(element.closest("nav")!).backgroundColor);
    return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
});

const AA = 4.5;

/** Contrast ratio of two CSS custom properties as resolved by the browser in the active color scheme. */
async function contrastBetween(foreground: string, background: string): Promise<number> {
  return page.evaluate(
    ([fg, bg]) => {
      const root = getComputedStyle(document.documentElement);
      const luminance = (token: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.fillStyle = root.getPropertyValue(token).trim();
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return r * 0.2126 + g * 0.7152 + b * 0.0722;
      };
      const a = luminance(fg);
      const b = luminance(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    },
    [foreground, background],
  );
}

it("keeps secondary, destructive and icon buttons at least 44px", async () => {
  for (const name of ["Secondary", "Destructive", "Close icon"]) {
    const bounds = await page.getByRole("button", { name }).boundingBox();
    expect(bounds?.height, name).toBeGreaterThanOrEqual(44);
    expect(bounds?.width, name).toBeGreaterThanOrEqual(44);
  }
});

it("shows a visible focus ring of at least 2px on every button variant", async () => {
  for (const name of ["Secondary", "Destructive", "Close icon"]) {
    const button = page.getByRole("button", { name });
    await button.focus();
    const focus = await button.evaluate((element) => ({
      width: parseFloat(getComputedStyle(element).outlineWidth),
      style: getComputedStyle(element).outlineStyle,
    }));
    expect(focus.width, name).toBeGreaterThanOrEqual(2);
    expect(focus.style, name).toBe("solid");
  }
});

it("applies the radius rule: controls 12px, cards 16px, panels 24px", async () => {
  const radius = (selector: string) =>
    page.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius));
  expect(await radius("input")).toBe(12);
  expect(await radius('[data-testid="card"]')).toBe(16);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--radius-panel").trim())).toBe("24px");
});

it("never uses pure black in the tinted elevation tokens", () => {
  const shadows = [...css.matchAll(/--elev-\d:\s*([^;]+);/g)].map((match) => match[1]);
  expect(shadows.length).toBe(6);
  for (const shadow of shadows) {
    expect(shadow).not.toMatch(/rgb\(\s*0[\s,]+0[\s,]+0/);
    expect(shadow).not.toMatch(/#0{3,6}\b/);
  }
});

it.each(["light", "dark"] as const)("resolves accent-soft and elevation tokens in the %s theme", async (scheme) => {
  await page.emulateMedia({ colorScheme: scheme });
  const tokens = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return ["--accent-soft", "--elev-1", "--elev-2", "--elev-3"].map((name) => root.getPropertyValue(name).trim());
  });
  for (const value of tokens) expect(value).not.toBe("");
});

it("changes color-bearing tokens between light and dark", async () => {
  const read = async (scheme: "light" | "dark") => {
    await page.emulateMedia({ colorScheme: scheme });
    return page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return { soft: root.getPropertyValue("--accent-soft").trim(), elev: root.getPropertyValue("--elev-2").trim() };
    });
  };
  const light = await read("light");
  const dark = await read("dark");
  expect(dark.soft).not.toBe(light.soft);
  expect(dark.elev).not.toBe(light.elev);
});

it.each([
  ["--accent", "--accent-soft"],
  ["--muted", "--surface-sunken"],
  ["--muted", "--surface"],
  ["--danger", "--surface"],
  ["--danger", "--danger-soft"],
  ["--warn", "--warn-soft"],
  ["--ok", "--ok-soft"],
  ["--foreground", "--surface"],
  ["--background", "--foreground"],
  ["--on-accent", "--accent"],
])("keeps %s on %s at WCAG AA in light and dark", async (foreground, background) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await contrastBetween(foreground, background), `${scheme} ${foreground} on ${background}`).toBeGreaterThanOrEqual(AA);
  }
});

it("keeps form field boundaries distinguishable from the surface (3:1) in light and dark", async () => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await contrastBetween("--border-strong", "--surface"), scheme).toBeGreaterThanOrEqual(3);
  }
});

it("renders tabular numerals for counts, prices and the countdown", async () => {
  const variant = await page.getByTestId("tabular").evaluate((element) => getComputedStyle(element).fontVariantNumeric);
  expect(variant).toContain("tabular-nums");
});

it("keeps the existing reduced-motion rule as the last rule of the stylesheet", () => {
  expect(css.trimEnd().endsWith("}")).toBe(true);
  expect(css.lastIndexOf("@media (prefers-reduced-motion: reduce)")).toBeGreaterThan(css.lastIndexOf(".ui-enter"));
  expect(css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"))).toContain("animation: none !important");
});
