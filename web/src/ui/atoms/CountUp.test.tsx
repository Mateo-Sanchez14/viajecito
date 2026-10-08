import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "./CountUp";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CountUp", () => {
  it("renders the final number at once when the engine reports no motion preference", () => {
    render(<p data-testid="n"><CountUp value={12} /></p>);

    expect(screen.getByTestId("n")).toHaveTextContent("12");
  });

  it("renders the final number at once under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));

    render(<p data-testid="n"><CountUp value={12} /></p>);

    expect(screen.getByTestId("n")).toHaveTextContent("12");
  });

  describe("with motion allowed", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame", "cancelAnimationFrame"] });
      vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    });

    it("starts at zero and ends on the value", () => {
      render(<p data-testid="n"><CountUp value={12} durationMs={400} /></p>);
      expect(screen.getByTestId("n")).toHaveTextContent("0");

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByTestId("n")).toHaveTextContent("12");
    });
  });
});
