import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineError } from "./InlineError";

describe("InlineError", () => {
  it("announces the message as an alert", () => {
    render(<InlineError message="No pudimos cargar la plata" />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar la plata");
  });

  it("hides the decorative icon from assistive technology", () => {
    render(<InlineError message="Fallo" />);

    expect(screen.getByRole("alert").querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("calls onRetry from the retry button", () => {
    const onRetry = vi.fn();
    render(<InlineError message="Fallo" retryLabel="Reintentar" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders no retry button without a handler", () => {
    render(<InlineError message="Fallo" retryLabel="Reintentar" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
