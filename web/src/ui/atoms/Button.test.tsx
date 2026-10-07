import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("is a primary, non-submitting button by default", () => {
    render(<Button>Guardar</Button>);

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("ui-button", "ui-button-primary", "w-full");
    expect(button).toHaveAttribute("type", "button");
  });

  it.each(["primary", "secondary", "destructive", "link"] as const)(
    "applies the %s variant class",
    (variant) => {
      render(<Button variant={variant}>x</Button>);

      expect(screen.getByRole("button", { name: "x" })).toHaveClass(`ui-button-${variant}`);
    },
  );

  it("only the primary variant is full width", () => {
    render(
      <>
        <Button variant="secondary">secondary</Button>
        <Button variant="destructive">destructive</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "secondary" })).not.toHaveClass("w-full");
    expect(screen.getByRole("button", { name: "destructive" })).not.toHaveClass("w-full");
  });

  it("renders the icon variant with its accessible name", () => {
    render(
      <Button variant="icon" aria-label="Cerrar">
        <svg aria-hidden="true" />
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveClass("ui-button-icon");
  });

  it("requires an accessible name for the icon variant at compile time", () => {
    // @ts-expect-error an icon-only button without aria-label must not type-check
    const unnamed = <Button variant="icon" />;

    expect(unnamed).toBeTruthy();
  });

  it("adds the compact size class only for size sm", () => {
    render(
      <>
        <Button size="sm">small</Button>
        <Button>medium</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "small" })).toHaveClass("ui-button-sm");
    expect(screen.getByRole("button", { name: "medium" })).not.toHaveClass("ui-button-sm");
  });

  it("does not fire onClick while disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardando
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardando" }));

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardando" })).toBeDisabled();
  });

  it("fires onClick when enabled and honors type submit", () => {
    const onClick = vi.fn();
    render(
      <Button type="submit" onClick={onClick}>
        Enviar
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Enviar" })).toHaveAttribute("type", "submit");
  });
});
