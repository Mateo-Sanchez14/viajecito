import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

let cached: Promise<string> | undefined;

/**
 * globals.css run through Tailwind, so a browser test sees the same stylesheet as the app (the
 * authored rules plus the utilities the markup uses). Node environment only. Compiled once per worker.
 */
export function compiledCss(): Promise<string> {
  cached ??= (async () => {
    const file = resolve(process.cwd(), "src/app/globals.css");
    const requireFromApp = createRequire(resolve(process.cwd(), "package.json"));
    const tailwindPath = requireFromApp.resolve("@tailwindcss/postcss");
    const postcss = createRequire(tailwindPath)("postcss");
    const tailwind = (await import(pathToFileURL(tailwindPath).href)).default;
    const result = await postcss([tailwind()]).process(await readFile(file, "utf8"), { from: file });
    return result.css as string;
  })();
  return cached;
}
