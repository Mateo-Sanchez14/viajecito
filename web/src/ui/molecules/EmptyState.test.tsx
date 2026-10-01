import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders icon, title, description and action", () => {
    render(
      <EmptyState
        icon={<span data-testid="icon" />}
        title="Nothing here"
        description="Nothing yet"
        action={<button>Crear</button>}
      />,
    );

    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear" })).toBeInTheDocument();
  });

  it("renders with only a title", () => {
    render(<EmptyState title="Empty" />);

    expect(screen.getByText("Empty")).toBeInTheDocument();
  });
});
