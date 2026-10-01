import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../messages/es-AR.json";
import { HealthBadge } from "./HealthBadge";

const { health } = messages.ops;

describe("HealthBadge", () => {
  it("shows the ok copy, version and passing checks", () => {
    renderWithProviders(
      <HealthBadge
        status="ok"
        version="0.1.0"
        checks={{ db: "ok", media: "ok" }}
      />,
    );

    expect(screen.getByText(health.ok)).toHaveAttribute(
      "data-variant",
      "ok",
    );
    expect(screen.getByText(health.version.replace("{version}", "0.1.0"))).toBeInTheDocument();
    expect(screen.getByText(`${health.checks.db}: ${health.check.ok}`)).toBeInTheDocument();
    expect(screen.getByText(`${health.checks.media}: ${health.check.ok}`)).toBeInTheDocument();
  });

  it("shows the degraded copy and flags the failing check", () => {
    renderWithProviders(
      <HealthBadge
        status="degraded"
        version="0.1.0"
        checks={{ db: "error", media: "ok" }}
      />,
    );

    expect(screen.getByText(health.degraded)).toHaveAttribute(
      "data-variant",
      "degraded",
    );
    expect(screen.getByText(`${health.checks.db}: ${health.check.error}`)).toBeInTheDocument();
    expect(screen.getByText(`${health.checks.media}: ${health.check.ok}`)).toBeInTheDocument();
  });
});
