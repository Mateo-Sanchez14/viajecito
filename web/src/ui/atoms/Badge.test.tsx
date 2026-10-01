import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge variant="neutral">hola</Badge>);

    expect(screen.getByText("hola")).toBeInTheDocument();
  });

  it.each([
    ["ok", "bg-ok-soft"],
    ["degraded", "bg-warn-soft"],
    ["neutral", "bg-surface"],
  ] as const)("applies the %s variant classes", (variant, expectedClass) => {
    render(<Badge variant={variant}>label</Badge>);

    expect(screen.getByText("label")).toHaveClass(expectedClass);
  });

  it("exposes the variant for styling and tests", () => {
    render(<Badge variant="ok">label</Badge>);

    expect(screen.getByText("label")).toHaveAttribute("data-variant", "ok");
  });
});
