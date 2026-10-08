import type { Page } from "@playwright/test";

/**
 * Worst-case WCAG contrast of each element's text over what is really painted behind it.
 *
 * For translucent surfaces the backdrop is not one color, so this measures it: every text is made
 * transparent, the text's own box is screenshotted, and each sampled pixel is compared with the text
 * color read beforehand. Returns the lowest ratio per selector (keyed by selector).
 */
export async function worstTextContrast(page: Page, selectors: string[]): Promise<Record<string, number>> {
  const colors = await page.evaluate((list) => {
    return list.map((selector) => {
      const element = document.querySelector(selector)!;
      const range = document.createRange();
      range.selectNodeContents(element);
      const rect = range.getBoundingClientRect();
      return { selector, color: getComputedStyle(element).color, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    });
  }, selectors);

  const hide = await page.addStyleTag({
    content: "*, *::before, *::after { color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }",
  });
  const result: Record<string, number> = {};
  try {
    for (const { selector, color, rect } of colors) {
      const shot = await page.screenshot({ clip: rect });
      result[selector] = await page.evaluate(
        async ({ base64, color: text }) => {
          const luminance = (r: number, g: number, b: number) => {
            const [lr, lg, lb] = [r, g, b].map((value) => {
              const channel = value / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
            return lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
          };
          const swatch = document.createElement("canvas").getContext("2d")!;
          swatch.canvas.width = swatch.canvas.height = 1;
          swatch.fillStyle = text;
          swatch.fillRect(0, 0, 1, 1);
          const [tr, tg, tb] = swatch.getImageData(0, 0, 1, 1).data;
          const textLum = luminance(tr, tg, tb);

          const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(bitmap, 0, 0);
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          let worst = Infinity;
          for (let index = 0; index < data.length; index += 4 * 3) {
            const lum = luminance(data[index], data[index + 1], data[index + 2]);
            const [high, low] = textLum > lum ? [textLum, lum] : [lum, textLum];
            worst = Math.min(worst, (high + 0.05) / (low + 0.05));
          }
          return worst;
        },
        { base64: shot.toString("base64"), color },
      );
    }
  } finally {
    await hide.evaluate((node) => (node as Element).remove());
  }
  return result;
}
