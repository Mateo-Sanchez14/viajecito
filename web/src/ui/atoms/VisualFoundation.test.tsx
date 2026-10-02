// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Button } from "./Button";
import { Input } from "./Input";
import { Skeleton } from "./Skeleton";
import { SectionNav } from "../molecules/SectionNav";

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // Exercise the actual authored stylesheet in a real browser, never CSS-class snapshots.
  const css = (await readFile(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8"))
    .replace(/@import[^;]+;/g, "");
  await page.setContent(renderToStaticMarkup(<main>
    <Button variant="link">Continue</Button>
    <Button disabled>Saving</Button>
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
