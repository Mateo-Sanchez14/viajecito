import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionNav } from "./SectionNav";

const items = [
  { key: "overview", label: "Resumen", href: "/crews/c/trips/t", active: false },
  { key: "budget", label: "Plata", href: "/crews/c/trips/t/budget", active: true },
];

describe("SectionNav", () => {
  it("renders a labelled nav with one link per item", () => {
    render(<SectionNav label="Secciones" items={items} />);

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resumen" })).toHaveAttribute("href", "/crews/c/trips/t");
    expect(screen.getByRole("link", { name: "Plata" })).toHaveAttribute(
      "href",
      "/crews/c/trips/t/budget",
    );
  });

  it("scrolls horizontally and accepts extra classes without assuming page padding", () => {
    render(<SectionNav label="Secciones" items={items} className="extra" />);

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(nav).toHaveClass("overflow-x-auto", "extra");
    expect(nav.className).not.toMatch(/-mx-|px-/);
  });

  it("carries a data-tour anchor only when asked, without changing the landmark", () => {
    const { rerender } = render(<SectionNav label="Secciones" items={items} />);
    expect(screen.getByRole("navigation", { name: "Secciones" })).not.toHaveAttribute("data-tour");

    rerender(<SectionNav label="Secciones" items={items} tourAnchor="nav" />);
    expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveAttribute("data-tour", "nav");
  });

  it("marks only the active item as the current page", () => {
    render(<SectionNav label="Secciones" items={items} />);

    expect(screen.getByRole("link", { name: "Plata" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Resumen" })).not.toHaveAttribute("aria-current");
  });
});
