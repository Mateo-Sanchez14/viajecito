import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppAtmosphere } from "./AppAtmosphere";

describe("AppAtmosphere", () => {
  it("is hidden from assistive tech and holds three glows and no text", () => {
    const { container } = render(<AppAtmosphere />);
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveClass("app-atmosphere");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect([...root.querySelectorAll("[data-blob]")].map((blob) => blob.getAttribute("data-blob"))).toEqual(["a", "b", "c"]);
    expect(root.textContent).toBe("");
  });

  it("offers nothing to focus or click", () => {
    const { container } = render(<AppAtmosphere />);

    expect(container.querySelectorAll("a, button, input, select, textarea, [tabindex], [role]")).toHaveLength(0);
  });
});
