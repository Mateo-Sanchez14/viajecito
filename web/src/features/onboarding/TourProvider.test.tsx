import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TourProvider, useTour } from "./TourProvider";

const wrapper = ({ children }: { children: ReactNode }) => <TourProvider>{children}</TourProvider>;

describe("TourProvider", () => {
  it("is inert outside a provider: unavailable, never running, never due", () => {
    const { result } = renderHook(() => useTour());

    expect(result.current.available).toBe(false);
    expect(result.current.running).toBe(false);
    expect(result.current.isPending()).toBe(false);
    expect(result.current.wasAutoStarted()).toBe(true);
    expect(() => act(() => result.current.start())).not.toThrow();
    expect(result.current.running).toBe(false);
  });

  it("starts and stops, with a new run id per start", () => {
    const { result } = renderHook(() => useTour(), { wrapper });
    expect(result.current).toMatchObject({ available: true, running: false, runId: 0 });

    act(() => result.current.start());
    expect(result.current).toMatchObject({ running: true, runId: 1 });
    act(() => result.current.stop());
    expect(result.current.running).toBe(false);
    act(() => result.current.start());
    expect(result.current.runId).toBe(2);
  });

  it("remembers a requested start until something starts, and that a start already happened", () => {
    const { result } = renderHook(() => useTour(), { wrapper });
    expect(result.current.wasAutoStarted()).toBe(false);

    act(() => result.current.requestStart());
    expect(result.current.isPending()).toBe(true);
    act(() => result.current.start());

    expect(result.current.isPending()).toBe(false);
    expect(result.current.wasAutoStarted()).toBe(true);
  });

  it("renders its children", () => {
    const { getByText } = render(<TourProvider>hola</TourProvider>);

    expect(getByText("hola")).toBeInTheDocument();
  });
});
