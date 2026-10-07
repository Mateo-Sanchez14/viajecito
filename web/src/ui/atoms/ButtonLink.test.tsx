import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ButtonLink } from "./ButtonLink";

describe("ButtonLink", () => {
  it("renders a link with button visuals", () => {
    render(<ButtonLink href="/plata">Ir a la plata</ButtonLink>);

    const link = screen.getByRole("link", { name: "Ir a la plata" });
    expect(link).toHaveAttribute("href", "/plata");
    expect(link).toHaveClass("ui-button", "ui-button-secondary");
    expect(link).not.toHaveClass("w-full");
  });

  it("supports the primary and compact variants", () => {
    render(
      <ButtonLink href="/x" variant="primary" size="sm">
        Abrir
      </ButtonLink>,
    );

    expect(screen.getByRole("link", { name: "Abrir" })).toHaveClass("ui-button-primary", "ui-button-sm");
  });

  it("keeps the underline for the link variant only", () => {
    render(
      <>
        <ButtonLink href="/a" variant="link">
          texto
        </ButtonLink>
        <ButtonLink href="/b">boton</ButtonLink>
      </>,
    );

    expect(screen.getByRole("link", { name: "texto" })).toHaveClass("underline");
    expect(screen.getByRole("link", { name: "boton" })).toHaveClass("no-underline");
  });
});
