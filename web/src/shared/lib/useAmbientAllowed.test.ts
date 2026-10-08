import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAmbientAllowed } from "./useAmbientAllowed";

function setup({ reduced, saveData }: { reduced: boolean | "none"; saveData: boolean | "none" }) {
  vi.stubGlobal(
    "matchMedia",
    reduced === "none"
      ? undefined
      : vi.fn(() => ({ matches: reduced, addEventListener() {}, removeEventListener() {} })),
  );
  if (saveData === "none") Reflect.deleteProperty(window.navigator, "connection");
  else
    Object.defineProperty(window.navigator, "connection", {
      configurable: true,
      value: Object.assign(new EventTarget(), { saveData }),
    });
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, "connection");
});

describe("useAmbientAllowed", () => {
  it("allows video only when motion is allowed and no data saving was requested", () => {
    setup({ reduced: false, saveData: false });
    expect(renderHook(() => useAmbientAllowed()).result.current).toBe(true);

    setup({ reduced: true, saveData: false });
    expect(renderHook(() => useAmbientAllowed()).result.current).toBe(false);

    setup({ reduced: false, saveData: true });
    expect(renderHook(() => useAmbientAllowed()).result.current).toBe(false);
  });

  it("denies when matchMedia is missing, and allows when only the connection API is missing", () => {
    setup({ reduced: "none", saveData: false });
    expect(renderHook(() => useAmbientAllowed()).result.current).toBe(false);

    setup({ reduced: false, saveData: "none" });
    expect(renderHook(() => useAmbientAllowed()).result.current).toBe(true);
  });

  it("is false in server markup, so no video is ever server rendered", () => {
    setup({ reduced: false, saveData: false });
    const Probe = () => createElement("span", null, String(useAmbientAllowed()));

    expect(renderToStaticMarkup(createElement(Probe))).toBe("<span>false</span>");
  });
});
