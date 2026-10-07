import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { contrast, definedClasses, themeTokens } from "@/test/cssTokens";
import { TripCoverArt, type TripCoverScene } from "./TripCoverArt";

const SCENES: TripCoverScene[] = ["road", "beach", "snow", "city"];
const SOURCE = readFileSync(resolve(process.cwd(), "src/ui/illustrations/TripCoverArt.tsx"), "utf8");

describe("TripCoverArt", () => {
  it.each(SCENES)("renders the %s scene as a decorative, unfocusable svg", (scene) => {
    const { container } = render(<TripCoverArt scene={scene} />);
    const svg = container.querySelector("svg")!;

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("viewBox", "0 0 480 270");
    expect(svg.dataset.scene).toBe(scene);
    expect(svg.querySelectorAll("a, button, input, [tabindex], title, text").length).toBe(0);
    expect(svg.querySelectorAll("path, rect, circle").length).toBeGreaterThan(6);
  });

  it("renders four different scenes", () => {
    const markup = new Set(SCENES.map((scene) => renderToStaticMarkup(<TripCoverArt scene={scene} />)));

    expect(markup.size).toBe(4);
  });

  it("never writes a color: no fill or stroke attributes and no color literals in the source", () => {
    expect(SOURCE).not.toMatch(/\b(fill|stroke)=/);
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/);
    expect(SOURCE).not.toMatch(/\bstyle=/);
  });

  it("only uses art classes that globals.css defines", () => {
    const defined = definedClasses();
    for (const scene of SCENES) {
      const classes = new Set(
        [...renderToStaticMarkup(<TripCoverArt scene={scene} />).matchAll(/class="([^"]+)"/g)].flatMap(([, value]) =>
          value.split(" ").filter(Boolean),
        ),
      );
      for (const name of classes) expect(defined.has(name), `${scene}: .${name}`).toBe(true);
    }
  });

  it("keeps the focal shapes visible against their backdrop in the dark theme", () => {
    const dark = themeTokens("dark");

    expect(contrast(dark["--art-sun"], dark["--art-sky"])).toBeGreaterThanOrEqual(3);
    expect(contrast(dark["--art-snow"], dark["--art-ground-2"])).toBeGreaterThanOrEqual(3);
  });

  it("keeps the ringed destination readable against the sky in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const tokens = themeTokens(theme);
      expect(contrast(tokens["--art-accent"], tokens["--art-sky"]), theme).toBeGreaterThanOrEqual(3);
    }
  });
});
