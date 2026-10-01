import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("is a decorative placeholder hidden from assistive tech", () => {
    render(<Skeleton data-testid="sk" className="h-4 w-20" />);

    const sk = screen.getByTestId("sk");
    expect(sk).toHaveAttribute("aria-hidden", "true");
    expect(sk).toHaveClass("h-4", "w-20");
  });
});
