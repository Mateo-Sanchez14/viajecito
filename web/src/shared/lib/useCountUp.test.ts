import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountUp } from "./useCountUp";

function stubMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reduce, addEventListener: () => {}, removeEventListener: () => {} })),
  );
}

/** Drives requestAnimationFrame from the fake clock, one 16ms frame at a time. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useCountUp", () => {
  it("is the final value immediately under reduced motion, and never animates", () => {
    stubMotion(true);
    const raf = vi.spyOn(globalThis, "requestAnimationFrame");

    const { result } = renderHook(() => useCountUp(42));

    expect(result.current).toBe(42);
    advance(2000);
    expect(result.current).toBe(42);
    expect(raf).not.toHaveBeenCalled();
  });

  it("is the final value when the engine cannot report a motion preference", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(renderHook(() => useCountUp(7)).result.current).toBe(7);
  });

  it("counts up from zero to the target and lands exactly on it", () => {
    stubMotion(false);

    const { result } = renderHook(() => useCountUp(30, 800));
    expect(result.current).toBe(0);

    advance(400);
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(30);

    advance(600);
    expect(result.current).toBe(30);
  });

  it("only ever goes up while counting up", () => {
    stubMotion(false);
    const seen: number[] = [];
    const { result } = renderHook(() => useCountUp(25, 800));

    for (let frame = 0; frame < 60; frame += 1) {
      advance(16);
      seen.push(result.current);
    }

    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen.at(-1)).toBe(25);
  });

  it("glides from where it is to a new target", () => {
    stubMotion(false);
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 400), { initialProps: { target: 10 } });
    advance(500);
    expect(result.current).toBe(10);

    rerender({ target: 20 });
    advance(200);
    expect(result.current).toBeGreaterThanOrEqual(10);
    expect(result.current).toBeLessThanOrEqual(20);
    advance(400);
    expect(result.current).toBe(20);
  });

  it("stops its animation frame when it unmounts", () => {
    stubMotion(false);
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    const { unmount } = renderHook(() => useCountUp(30));

    unmount();

    expect(cancel).toHaveBeenCalled();
  });
});
