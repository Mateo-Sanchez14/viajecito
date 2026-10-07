import type { Page } from "@playwright/test";

/**
 * WCAG contrast of an element's text color over its own opaque backdrop, measured in the page
 * (so `color-mix`, custom properties and the active color scheme are all resolved by the browser).
 */
export async function textContrast(page: Page, textSelector: string, backdropSelector: string): Promise<number> {
  return page.evaluate(
    ({ textSelector: text, backdropSelector: backdrop }) => {
      const luminance = (css: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.fillStyle = css;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return r * 0.2126 + g * 0.7152 + b * 0.0722;
      };
      const color = getComputedStyle(document.querySelector(text)!).color;
      const background = getComputedStyle(document.querySelector(backdrop)!).backgroundColor;
      const [high, low] = [luminance(color), luminance(background)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    },
    { textSelector, backdropSelector },
  );
}
