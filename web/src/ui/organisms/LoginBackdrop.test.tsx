import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginBackdrop } from "./LoginBackdrop";

describe("LoginBackdrop", () => {
  it("frames the media slot with a scrim, grain and the brand, all hidden from assistive tech", () => {
    const { container } = render(<LoginBackdrop brand="viajecito" media={<div data-testid="media" />} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveClass("login-backdrop");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.querySelector("[data-testid=media]")).not.toBeNull();
    expect(root.querySelector(".login-backdrop-scrim")).not.toBeNull();
    expect(root.querySelector(".login-backdrop-grain")).not.toBeNull();
    expect(root.querySelector(".login-brand")).toHaveTextContent("viajecito");
  });

  it("is inert: no focusable or interactive descendants", () => {
    const { container } = render(<LoginBackdrop brand="viajecito" media={null} />);

    expect(container.querySelectorAll("a, button, input, video, [tabindex]")).toHaveLength(0);
  });
});
