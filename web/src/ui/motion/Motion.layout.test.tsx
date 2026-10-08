// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compiledCss } from "@/test/compiledCss";
import { PlusIcon } from "@/ui/icons";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { BottomNav, type BottomNavItem } from "@/ui/molecules/BottomNav";
import { AppHeader } from "@/ui/organisms/AppHeader";

// Headless Chromium launches slowly when the whole suite runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const RAW_CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const icon = <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" />;
const item = (key: string, label: string): BottomNavItem => ({ key, label, href: `/t/${key}`, active: false, icon });

const chrome = renderToStaticMarkup(
  <>
    <AppHeader appName="viajecito" greeting="Hola" logoutLabel="Salir" onLogout={() => {}} />
    <main className="app-canvas mx-auto">
      <div id="live" style={{ width: 240, height: 135 }}>
        <TripCoverArt scene="road" live />
      </div>
      <div id="still" style={{ width: 240, height: 135 }}>
        <TripCoverArt scene="road" />
      </div>
      <div className="trip-section" id="section" style={{ viewTransitionName: "section-old", viewTransitionClass: "section-exit" }}>
        <p>old section</p>
      </div>
    </main>
    <BottomNav label="Menu" items={[item("a", "A"), item("b", "B")]} />
    <button type="button" className="quick-capture-fab">
      <PlusIcon size={24} aria-hidden="true" />
    </button>
  </>,
);

let browser: Browser;
let page: Page;
let css = "";

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  css = await compiledCss();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function show(width: number, reducedMotion: "reduce" | "no-preference") {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width, height: 844 });
  await page.setContent(`<body>${chrome}</body>`);
  await page.addStyleTag({ content: css });
}

/**
 * React gives the page that leaves and the page that arrives separate names and the exit/enter
 * classes; this does the same inside a real view transition and reports what animates.
 */
async function runSectionTransition() {
  return page.evaluate(async () => {
    const swap = () => {
      const old = document.getElementById("section")!;
      const next = old.cloneNode(false) as HTMLElement;
      next.style.setProperty("view-transition-name", "section-new");
      next.style.setProperty("view-transition-class", "section-enter");
      next.textContent = "new section";
      old.replaceWith(next);
    };
    const transition = document.startViewTransition(swap);
    await transition.ready;
    const animations = document.getAnimations().flatMap((animation) => {
      const effect = animation.effect as KeyframeEffect | null;
      if (!effect?.pseudoElement?.startsWith("::view-transition")) return [];
      const timing = effect.getComputedTiming();
      return [
        {
          pseudo: effect.pseudoElement,
          name: (animation as CSSAnimation).animationName ?? "",
          duration: Number(timing.duration),
          delay: Number(timing.delay),
        },
      ];
    });
    transition.skipTransition();
    return animations;
  });
}

describe("view-transition rules", () => {
  it("references motion tokens for every authored duration and easing", () => {
    const rules = [...RAW_CSS.matchAll(/(::view-transition[^{}]*)\{([^{}]*)\}/g)].filter(([, , body]) => !body.includes("!important"));

    expect(rules.length).toBeGreaterThan(4);
    for (const [, selector, body] of rules) {
      for (const declaration of body.split(";")) {
        if (!/^\s*animation(-duration|-timing-function|-delay)?\s*:/.test(declaration)) continue;
        if (/animation\s*:\s*none/.test(declaration)) continue;
        expect(declaration, selector).not.toMatch(/\b\d+(\.\d+)?m?s\b/);
        expect(declaration, selector).toMatch(/var\(--(dur|ease)-/);
      }
    }
  });

  it("keeps the reduced-motion block last in the file", () => {
    const lastMedia = RAW_CSS.lastIndexOf("@media (prefers-reduced-motion: reduce)");
    const after = RAW_CSS.slice(lastMedia);

    expect(after).toContain("::view-transition-group(*)");
    expect(after).toContain("::view-transition-new(*)");
    expect(after.match(/@media/g)).toHaveLength(1);
  });
});

describe("persistent chrome names", () => {
  it.each([390, 1280])("gives header, bottom nav and capture trigger distinct names at %ipx", async (width) => {
    await show(width, "no-preference");

    const names = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("body *")]
        .map((element) => ({
          cls: element.className.toString(),
          name: getComputedStyle(element).viewTransitionName,
          rendered: element.getClientRects().length > 0,
        }))
        .filter(({ name, rendered }) => name !== "none" && rendered),
    );

    const list = names.map(({ name }) => name);
    expect(new Set(list).size).toBe(list.length);
    expect(list).toContain("app-header");
    expect(list).toContain("capture-fab");
    // The bottom nav only paints (and so only holds a name) below the md breakpoint.
    expect(list.includes("bottom-nav")).toBe(width < 768);
  });
});

describe("section transition", () => {
  it("runs vt-section-in on the new section within the 420 ms ceiling when motion is allowed", async () => {
    await show(390, "no-preference");

    const animations = await runSectionTransition();

    const entering = animations.find(({ pseudo, name }) => pseudo === "::view-transition-new(section-new)" && name === "vt-section-in");
    expect(entering).toBeDefined();
    expect(entering!.duration + entering!.delay).toBeLessThanOrEqual(420);
    const leaving = animations.find(({ pseudo, name }) => pseudo === "::view-transition-old(section-old)" && name === "vt-section-out");
    expect(leaving).toBeDefined();
    expect(leaving!.duration + leaving!.delay).toBeLessThanOrEqual(420);
  });

  it("leaves the app header group without any animation", async () => {
    await show(390, "no-preference");

    const animations = await runSectionTransition();

    expect(animations.filter(({ pseudo }) => pseudo.includes("(app-header)"))).toEqual([]);
    expect(animations.filter(({ pseudo }) => pseudo.includes("(capture-fab)"))).toEqual([]);
  });

  it("runs every view-transition animation at zero duration under reduced motion", async () => {
    await show(390, "reduce");

    const animations = await runSectionTransition();

    expect(animations.length).toBeGreaterThan(0);
    for (const animation of animations) {
      expect(animation.duration, animation.pseudo).toBe(0);
      expect(animation.delay, animation.pseudo).toBe(0);
    }
  });
});

describe("live illustration", () => {
  const read = (selector: string) =>
    page.evaluate((query) => {
      const element = document.querySelector(query)!;
      const style = getComputedStyle(element);
      return { animation: style.animationName, offset: style.strokeDashoffset, opacity: style.opacity };
    }, selector);

  it("runs drift, march and breathe on the live hero art only when motion is allowed", async () => {
    await show(390, "no-preference");

    expect((await read("#live .art-cloud")).animation).toBe("art-drift");
    expect((await read("#live .art-ring")).animation).toBe("art-breathe");
    expect((await read("#live svg .art-dash")).animation).toBe("art-march-road");
    expect((await read("#still .art-cloud")).animation).toBe("none");
    expect((await read("#still .art-ring")).animation).toBe("none");
  });

  it("renders the static, fully drawn art under reduced motion", async () => {
    await show(390, "reduce");

    for (const selector of ["#live .art-cloud", "#live .art-ring", "#live .art-dash"]) {
      const state = await read(selector);
      expect(state.animation, selector).toBe("none");
      expect(state.opacity, selector).toBe("1");
      expect(Number.parseFloat(state.offset), selector).toBe(0);
    }
  });
});
