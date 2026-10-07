import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("exposes a named progressbar with min, max and now", () => {
    render(<ProgressBar value={0.6} label="Confirmados" />);

    const bar = screen.getByRole("progressbar", { name: "Confirmados" });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "60");
  });

  it("drives the fill width through the --progress variable", () => {
    render(<ProgressBar value={0.25} label="Avance" />);

    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.style.getPropertyValue("--progress")).toBe("0.25");
  });

  it("renders an empty bar for zero", () => {
    render(<ProgressBar value={0} label="Vacio" />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -3])(
    "never renders NaN or out-of-range values for %s",
    (value) => {
      render(<ProgressBar value={value} label="Roto" />);

      const bar = screen.getByRole("progressbar");
      expect(bar.outerHTML).not.toContain("NaN");
      const now = Number(bar.getAttribute("aria-valuenow"));
      expect(now).toBeGreaterThanOrEqual(0);
      expect(now).toBeLessThanOrEqual(100);
    },
  );

  it("clamps values above one to a full bar", () => {
    render(<ProgressBar value={4} label="Lleno" />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});
