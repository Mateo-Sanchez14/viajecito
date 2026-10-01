import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
  it("accepts typed text", () => {
    render(<Textarea aria-label="notas" />);

    fireEvent.change(screen.getByLabelText("notas"), { target: { value: "hola" } });

    expect(screen.getByLabelText("notas")).toHaveValue("hola");
  });

  it("flags itself as invalid", () => {
    render(<Textarea aria-label="notas" invalid />);

    expect(screen.getByLabelText("notas")).toBeInvalid();
  });
});
