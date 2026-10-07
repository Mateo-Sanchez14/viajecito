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

  it("has no initials for a name that starts with a non-letter, such as a phone number", () => {
    expect(initialsOf("+5491155551234")).toBe("");
    expect(initialsOf("+54 9 11 5555 1234")).toBe("");
  });

  it("skips words that do not start with a letter and keeps accented letters", () => {
    expect(initialsOf("Ana +5491155551234")).toBe("A");
    expect(initialsOf("álvaro (el) núñez")).toBe("ÁN");
  });
});

describe("Avatar", () => {
  it("shows initials when there is no image", () => {
    render(<Avatar name="Lucia Gomez" />);

    expect(screen.getByLabelText("Lucia Gomez")).toHaveTextContent("LG");
  });

  it("shows a person icon instead of a plus sign for a phone-only participant", () => {
    render(<Avatar name="+5491155551234" />);

    const avatar = screen.getByRole("img", { name: "+5491155551234" });
    expect(avatar).not.toHaveTextContent("+");
    expect(avatar.querySelector("svg[aria-hidden='true']")).toBeInTheDocument();
  });

  it("shows the image when a src is given", () => {
    render(<Avatar name="Lucia Gomez" src="/lucia.png" />);

    expect(screen.getByRole("img", { name: "Lucia Gomez" })).toHaveAttribute(
      "src",
      "/lucia.png",
    );
  });
});
