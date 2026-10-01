import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders icon, title, description and action", () => {
    render(
      <EmptyState
        icon={<span data-testid="icon" />}
        title="Nada por acá"
        description="Todavía no hay nada"
        action={<button>Crear</button>}
      />,
    );

    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Nada por acá")).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay nada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear" })).toBeInTheDocument();
  });

  it("renders with only a title", () => {
    render(<EmptyState title="Vacío" />);

    expect(screen.getByText("Vacío")).toBeInTheDocument();
  });
});
