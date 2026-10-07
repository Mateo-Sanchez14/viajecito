import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

export type Theme = "light" | "dark";

/** Reads the `:root` custom properties of one theme straight from globals.css. */
export function themeTokens(theme: Theme): Record<string, string> {
  const dark = CSS.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)?.[1] ?? "";
  const light = CSS.match(/:root \{([^}]*)\}/)?.[1] ?? "";
  const read = (block: string) =>
    Object.fromEntries(
      [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.replace(/\/\*.*?\*\//g, "").trim()]),
    );
  return theme === "light" ? read(light) : { ...read(light), ...read(dark) };
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#rrggbb` colors. */
export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Every class name defined by an authored rule in globals.css. */
export function definedClasses(): Set<string> {
  return new Set([...CSS.matchAll(/\.([a-z][\w-]*)/g)].map(([, name]) => name));
}
