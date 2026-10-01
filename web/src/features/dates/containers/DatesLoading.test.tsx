import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { DatesLoading } from "./DatesLoading";

describe("DatesLoading", () => {
  it("announces that the dates are loading", () => {
    renderWithProviders(<DatesLoading />);

    expect(screen.getByRole("status", { name: messages.dates.loading })).toBeInTheDocument();
  });
});
