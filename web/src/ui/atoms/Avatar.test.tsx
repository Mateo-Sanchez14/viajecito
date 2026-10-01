import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, initialsOf } from "./Avatar";

describe("initialsOf", () => {
  it("takes up to two initials, uppercased", () => {
    expect(initialsOf("ana maria perez")).toBe("AM");
    expect(initialsOf("  juan ")).toBe("J");
  });

  it("falls back to a placeholder for an empty name", () => {
    expect(initialsOf("   ")).toBe("?");
  });
});

describe("Avatar", () => {
  it("shows initials when there is no image", () => {
    render(<Avatar name="Lucia Gomez" />);

    expect(screen.getByLabelText("Lucia Gomez")).toHaveTextContent("LG");
  });

  it("shows the image when a src is given", () => {
    render(<Avatar name="Lucia Gomez" src="/lucia.png" />);

    expect(screen.getByRole("img", { name: "Lucia Gomez" })).toHaveAttribute(
      "src",
      "/lucia.png",
    );
  });
});
