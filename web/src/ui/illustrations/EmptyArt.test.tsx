import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { definedClasses } from "@/test/cssTokens";
import { EmptyArt, type EmptyArtScene } from "./EmptyArt";

const SCENES: EmptyArtScene[] = ["map", "suitcase", "ticket", "coins"];
const SOURCE = readFileSync(resolve(process.cwd(), "src/ui/illustrations/EmptyArt.tsx"), "utf8");

describe("EmptyArt", () => {
  it.each(SCENES)("renders the %s scene as a small decorative svg", (scene) => {
    const { container } = render(<EmptyArt scene={scene} />);
    const svg = container.querySelector("svg")!;

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("viewBox", "0 0 160 120");
    expect(svg.querySelectorAll("a, button, [tabindex], title, text").length).toBe(0);
    // The soft backdrop counts as a shape: at most eight in total.
    expect(svg.querySelectorAll("path, rect, circle, ellipse, polygon").length).toBeLessThanOrEqual(8);
  });

  it("renders four different scenes", () => {
    expect(new Set(SCENES.map((scene) => renderToStaticMarkup(<EmptyArt scene={scene} />))).size).toBe(4);
  });

  it("never writes a color and only uses classes globals.css defines", () => {
    expect(SOURCE).not.toMatch(/\b(fill|stroke)=/);
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);

    const defined = definedClasses();
    for (const scene of SCENES) {
      for (const [, value] of renderToStaticMarkup(<EmptyArt scene={scene} />).matchAll(/class="([^"]+)"/g)) {
        for (const name of value.split(" ").filter(Boolean)) expect(defined.has(name), `${scene}: .${name}`).toBe(true);
      }
    }
  });
});
