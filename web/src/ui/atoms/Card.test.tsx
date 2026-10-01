import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
  it("renders its children inside a surface", () => {
    render(<Card data-testid="card">contenido</Card>);

    expect(screen.getByTestId("card")).toHaveTextContent("contenido");
  });

  it("can render as another element and keeps extra classes", () => {
    render(
      <Card as="section" className="extra" aria-label="seccion">
        x
      </Card>,
    );

    const card = screen.getByLabelText("seccion");
    expect(card.tagName).toBe("SECTION");
    expect(card).toHaveClass("extra");
  });
});
