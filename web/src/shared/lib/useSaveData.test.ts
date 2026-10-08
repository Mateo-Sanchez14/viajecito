import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useSaveData } from "./useSaveData";

function setConnection(value: unknown) {
  Object.defineProperty(window.navigator, "connection", { configurable: true, value });
}

afterEach(() => {
  Reflect.deleteProperty(window.navigator, "connection");
});

describe("useSaveData", () => {
  it("is false on the client when the browser exposes no connection", () => {
    expect(renderHook(() => useSaveData()).result.current).toBe(false);
  });

  it("reports saveData from the connection", () => {
    setConnection(Object.assign(new EventTarget(), { saveData: true }));
    expect(renderHook(() => useSaveData()).result.current).toBe(true);

    setConnection(Object.assign(new EventTarget(), { saveData: false }));
    expect(renderHook(() => useSaveData()).result.current).toBe(false);
  });

  it("follows the connection change event", () => {
    const connection = Object.assign(new EventTarget(), { saveData: false });
    setConnection(connection);
    const { result } = renderHook(() => useSaveData());
    expect(result.current).toBe(false);

    act(() => {
      connection.saveData = true;
      connection.dispatchEvent(new Event("change"));
    });

    expect(result.current).toBe(true);
  });
});
