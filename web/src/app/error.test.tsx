import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../messages/es-AR";
import ErrorPage from "./error";

describe("root error page", () => {
  it("shows the i18n copy and resets on retry", () => {
    const reset = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(
      <ErrorPage error={new Error("api down")} retry={reset} />,
    );

    expect(
      screen.getByRole("heading", { name: messages.errors.unexpected.title }),
    ).toBeInTheDocument();
    expect(screen.queryByText("api down")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: messages.errors.unexpected.retry }),
    );
    expect(reset).toHaveBeenCalledOnce();
  });
});
