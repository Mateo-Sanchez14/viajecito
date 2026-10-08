import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TourAnchor } from "@/shared/lib/tourAnchors";
import { useAnchorRect } from "./useAnchorRect";

let box = { x: 10, y: 20, width: 100, height: 40 };
let element: HTMLElement;

function Probe({ anchor }: { anchor: TourAnchor }) {
  const { rect, measured, element: found } = useAnchorRect(anchor);
  return (
    <p data-testid="out">
      {JSON.stringify({ rect, measured, found: found !== null })}
    </p>
  );
}

const out = () => JSON.parse(screen.getByTestId("out").textContent ?? "{}") as {
  rect: typeof box | null;
  measured: boolean;
  found: boolean;
};

/** One animation frame, flushed synchronously. */
function frames() {
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => queue.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  return () => act(() => queue.splice(0).forEach((callback) => callback(0)));
}

beforeEach(() => {
  box = { x: 10, y: 20, width: 100, height: 40 };
  element = document.createElement("div");
  element.dataset.tour = "rsvp";
  element.getBoundingClientRect = () => ({ ...box, top: box.y, left: box.x, right: box.x + box.width, bottom: box.y + box.height, toJSON: () => ({}) }) as DOMRect;
  document.body.append(element);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("useAnchorRect", () => {
  it("measures the anchor on mount", () => {
    render(<Probe anchor="rsvp" />);

    expect(out()).toEqual({ rect: box, measured: true, found: true });
  });

  it("reports a missing anchor as measured and gone, not as unmeasured", () => {
    element.remove();
    render(<Probe anchor="rsvp" />);

    expect(out()).toEqual({ rect: null, measured: true, found: false });
  });

  it("follows a window resize, once per frame", () => {
    const flush = frames();
    render(<Probe anchor="rsvp" />);

    box = { x: 10, y: 20, width: 200, height: 40 };
    act(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    });
    expect(out().rect?.width).toBe(100); // nothing until the frame
    flush();

    expect(out().rect).toEqual(box);
  });

  it("follows a scroll of anything on the page (capture phase)", () => {
    const flush = frames();
    const strip = document.createElement("div");
    document.body.append(strip);
    render(<Probe anchor="rsvp" />);

    box = { x: 10, y: -50, width: 100, height: 40 };
    act(() => {
      strip.dispatchEvent(new Event("scroll"));
    });
    flush();

    expect(out().rect?.y).toBe(-50);
  });

  it("notices when the anchor disappears", () => {
    const flush = frames();
    render(<Probe anchor="rsvp" />);

    element.remove();
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    flush();

    expect(out()).toEqual({ rect: null, measured: true, found: false });
  });

  it("stops listening on unmount", () => {
    const removed = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Probe anchor="rsvp" />);

    unmount();

    expect(removed.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(["resize", "scroll"]));
  });
});
