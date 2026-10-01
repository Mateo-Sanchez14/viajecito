import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { HealthBadge } from "./HealthBadge";

describe("HealthBadge", () => {
  it("shows the ok copy, version and passing checks", () => {
    renderWithProviders(
      <HealthBadge
        status="ok"
        version="0.1.0"
        checks={{ db: "ok", media: "ok" }}
      />,
    );

    expect(screen.getByText("Todo en orden")).toHaveAttribute(
      "data-variant",
      "ok",
    );
    expect(screen.getByText("Versión 0.1.0")).toBeInTheDocument();
    expect(screen.getByText("Base de datos: ok")).toBeInTheDocument();
    expect(screen.getByText("Archivos: ok")).toBeInTheDocument();
  });

  it("shows the degraded copy and flags the failing check", () => {
    renderWithProviders(
      <HealthBadge
        status="degraded"
        version="0.1.0"
        checks={{ db: "error", media: "ok" }}
      />,
    );

    expect(screen.getByText("Algo anda flojo")).toHaveAttribute(
      "data-variant",
      "degraded",
    );
    expect(screen.getByText("Base de datos: con problemas")).toBeInTheDocument();
    expect(screen.getByText("Archivos: ok")).toBeInTheDocument();
  });
});
