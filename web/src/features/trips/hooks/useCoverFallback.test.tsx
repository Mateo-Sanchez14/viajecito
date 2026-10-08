import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCoverFallback } from "./useCoverFallback";

describe("useCoverFallback", () => {
  it("shows the photo while a cover exists and nothing failed", () => {
    const { result } = renderHook(() => useCoverFallback({ has_cover: true, cover_version: 1 }));

    expect(result.current.showPhoto).toBe(true);
  });

  it("shows no photo for a trip without a cover, or without a trip", () => {
    expect(renderHook(() => useCoverFallback({ has_cover: false, cover_version: 0 })).result.current.showPhoto).toBe(false);
    expect(renderHook(() => useCoverFallback(null)).result.current.showPhoto).toBe(false);
  });

  it("hides the photo after a load error and tries again for a new cover version", () => {
    const { result, rerender } = renderHook(({ version }) => useCoverFallback({ has_cover: true, cover_version: version }), {
      initialProps: { version: 1 },
    });

    act(() => result.current.onError());
    expect(result.current.showPhoto).toBe(false);

    rerender({ version: 2 });
    expect(result.current.showPhoto).toBe(true);
  });

  it("ignores an error reported without a trip", () => {
    const { result } = renderHook(() => useCoverFallback(null));

    act(() => result.current.onError());

    expect(result.current.showPhoto).toBe(false);
  });
});
