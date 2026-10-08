import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/** A matchMedia stub whose single query can be flipped from the test. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return {
    set(next: boolean) {
      matches = next;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("usePrefersReducedMotion", () => {
  it("treats an engine without matchMedia as reduce", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true);
  });

  it("reports the media query: no-preference is false, reduce is true", () => {
    stubMatchMedia(false);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);

    stubMatchMedia(true);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true);
  });

  it("follows a live change of the preference and unsubscribes on unmount", () => {
    const media = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);

    act(() => media.set(false));
    expect(result.current).toBe(false);

    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it("asks for the reduced-motion query", () => {
    stubMatchMedia(false);
    renderHook(() => usePrefersReducedMotion());

    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });
});
