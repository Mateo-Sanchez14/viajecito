import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import messages from "../../../../messages/es-AR";

/** Every `t("...")` key (and the step keys it builds) the tour code can ask for. */
const KEYS = [
  "replay",
  "progress",
  "skip",
  "back",
  "next",
  "done",
  ...(["nav", "cover", "nextActions", "rsvp", "capture"] as const).flatMap((id) => [
    `steps.${id}.title`,
    `steps.${id}.body`,
  ]),
];

function resolve(path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages.onboarding);
}

describe("onboarding copy", () => {
  it("resolves every key the tour uses to a non-empty string in the merged es-AR messages", () => {
    for (const key of KEYS) {
      const value = resolve(key);
      expect(typeof value, key).toBe("string");
      expect((value as string).length, key).toBeGreaterThan(0);
    }
  });

  it("keeps the progress placeholders", () => {
    expect(messages.onboarding.progress).toContain("{current}");
    expect(messages.onboarding.progress).toContain("{total}");
  });

  it("uses voseo, never tuteo, in the imperative copy", () => {
    const text = JSON.stringify(messages.onboarding);
    expect(text).not.toMatch(/\b(Toca|Mira|Tira|Agrega|Confirma el|Elige)\b/);
    expect(text).toMatch(/Tocá|Confirmá|Agregá/);
  });

  it("keeps Spanish out of the tour code: it only reads message keys", () => {
    const root = join(process.cwd(), "src/features/onboarding");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    walk(root);

    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(source, file).not.toMatch(/[áéíóúñ¿¡]/i);
    }
  });
});
