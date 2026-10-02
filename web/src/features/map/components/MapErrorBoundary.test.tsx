import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MapErrorBoundary } from "./MapErrorBoundary";
it("keeps the independent list available when the map chunk fails", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  function BrokenMap(): never {
    throw new Error("Map chunk failed");
  }
  try {
    render(
      <>
        <MapErrorBoundary fallback={<p role="status">Map unavailable</p>}>
          <BrokenMap />
        </MapErrorBoundary>
        <ol aria-label="Places">
          <li>Hotel</li>
        </ol>
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Map unavailable");
    expect(screen.getByRole("list", { name: "Places" })).toHaveTextContent(
      "Hotel",
    );
  } finally {
    log.mockRestore();
  }
});
