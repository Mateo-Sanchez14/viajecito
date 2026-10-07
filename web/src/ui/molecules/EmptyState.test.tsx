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

  it("renders an illustration above the title without replacing the title or the action", () => {
    render(
      <EmptyState
        art={<svg data-testid="art" aria-hidden="true" />}
        title="No hay nada"
        action={<button>Crear</button>}
      />,
    );

    const art = screen.getByTestId("art");
    const title = screen.getByText("No hay nada");
    expect(art.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear" })).toBeInTheDocument();
  });

  it("adds no art wrapper when there is no illustration", () => {
    const { container } = render(<EmptyState title="Empty" />);

    expect(container.querySelector(".ui-empty-art")).toBeNull();
  });
});
