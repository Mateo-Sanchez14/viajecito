import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripShell } from "./TripShell";

describe("TripShell", () => {
  it("composes the header, the section nav and the page content", () => {
    render(
      <TripShell
        title="Bariloche"
        subtitle="1 al 8"
        navLabel="Secciones"
        navItems={[{ key: "overview", label: "Resumen", href: "/t", active: true }]}
      >
        <p>contenido</p>
      </TripShell>,
    );

    expect(screen.getByRole("heading", { name: "Bariloche" })).toBeInTheDocument();
    expect(screen.getByText("1 al 8")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Secciones" })).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("does not wrap the section nav when there is no mobile nav", () => {
    render(
      <TripShell
        title="Bariloche"
        navLabel="Secciones"
        navItems={[{ key: "overview", label: "Resumen", href: "/t", active: true }]}
      >
        <p>contenido</p>
      </TripShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(nav.closest(".trip-nav-wide")).toBeNull();
  });

  it("wraps the section nav for md and up and renders the mobile nav after it", () => {
    render(
      <TripShell
        title="Bariloche"
        navLabel="Secciones"
        navItems={[{ key: "overview", label: "Resumen", href: "/t", active: true }]}
        mobileNav={<nav aria-label="Menú del viaje">mobile</nav>}
      >
        <p>contenido</p>
      </TripShell>,
    );

    const wide = screen.getByRole("navigation", { name: "Secciones" });
    const mobile = screen.getByRole("navigation", { name: "Menú del viaje" });
    expect(wide.closest(".trip-nav-wide")).not.toBeNull();
    expect(mobile.closest(".trip-nav-wide")).toBeNull();
    expect(wide.compareDocumentPosition(mobile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mobile.compareDocumentPosition(screen.getByText("contenido")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
