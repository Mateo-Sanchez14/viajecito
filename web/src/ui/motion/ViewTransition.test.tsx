import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const SRC = resolve(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

afterEach(() => {
  vi.doUnmock("react");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("ViewTransition wrapper", () => {
  it("renders the child unchanged, with no extra element and no console error, on stable React", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ViewTransition, hasNativeViewTransition } = await import("./ViewTransition");

    const { container } = render(
      <ViewTransition key="a" enter="section-enter" exit="section-exit" default="none">
        <p>content</p>
      </ViewTransition>,
    );

    expect(hasNativeViewTransition).toBe(false);
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(container.firstElementChild?.tagName).toBe("P");
    expect(container.children).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("uses the component React exports when there is one", async () => {
    const Fake = ({ children }: { children?: React.ReactNode }) => <div data-fake-vt>{children}</div>;
    vi.resetModules();
    vi.doMock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), ViewTransition: Fake }));

    const { ViewTransition, hasNativeViewTransition } = await import("./ViewTransition");
    const { container } = render(
      <ViewTransition>
        <span>inside</span>
      </ViewTransition>,
    );

    expect(hasNativeViewTransition).toBe(true);
    expect(ViewTransition).toBe(Fake);
    expect(container.querySelector("[data-fake-vt] > span")).toHaveTextContent("inside");
  });

  it("is the only module that imports ViewTransition from react", () => {
    const importers = sourceFiles(SRC)
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        const named = /import\s*(?:type\s*)?\{[^}]*\bViewTransition\b[^}]*\}\s*from\s*["']react["']/.test(source);
        const member = /React\.ViewTransition\b|\(React as [^)]*\)\.ViewTransition/.test(source);
        return named || member;
      })
      .map((file) => relative(SRC, file));

    expect(importers).toEqual(["ui/motion/ViewTransition.tsx"]);
  });
});
