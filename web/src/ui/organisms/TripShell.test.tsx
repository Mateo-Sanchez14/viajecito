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
});
