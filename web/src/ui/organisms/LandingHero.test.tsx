import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LandingHero, type LandingNext } from "./LandingHero";

const trip: Extract<LandingNext, { status: "trip" }> = {
  status: "trip",
  label: "Próximo viaje",
  name: "Bariloche 2027",
  destination: "Bariloche",
  dates: "1 jul al 8 jul",
  href: "/crews/c/trips/t",
  cta: "Ver el viaje",
  countdown: { value: "10", unit: "días", caption: "para salir" },
};

function setup(next: LandingNext) {
  return render(
    <LandingHero media={<div data-testid="media" />} greeting="Hola, Mateo" tagline="Planeá el próximo viaje" next={next} />,
  );
}

describe("LandingHero", () => {
  it("has exactly one h1, the greeting, naming the landmark", () => {
    setup(trip);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Hola, Mateo" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Hola, Mateo" })).toBeInTheDocument();
    expect(screen.getByText("Planeá el próximo viaje")).toBeInTheDocument();
    expect(screen.getByTestId("media").closest(".landing-hero-media")).toBeInTheDocument();
  });

  it("shows the next trip with name, destination, dates and countdown once each, and a link to it", () => {
    setup(trip);

    expect(screen.getAllByText("Bariloche 2027")).toHaveLength(1);
    expect(screen.getAllByText("Bariloche")).toHaveLength(1);
    expect(screen.getAllByText("1 jul al 8 jul")).toHaveLength(1);
    expect(screen.getAllByText("10")).toHaveLength(1);
    expect(screen.getByText("10")).toHaveClass("ui-tabular", "ui-flip");
    expect(screen.getByText("días")).toBeInTheDocument();
    expect(screen.getByText("para salir")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Bariloche 2027" })).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Ver el viaje" });
    expect(cta).toHaveAttribute("href", "/crews/c/trips/t");
    expect(cta.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("remounts the figure when the value changes so it flips again", () => {
    const view = setup(trip);
    const first = screen.getByText("10");

    view.rerender(
      <LandingHero
        media={null}
        greeting="Hola, Mateo"
        tagline="t"
        next={{ ...trip, countdown: { value: "9", unit: "días", caption: "para salir" } }}
      />,
    );

    expect(screen.getByText("9")).not.toBe(first);
    expect(first).not.toBeInTheDocument();
  });

  it("omits the meta line when the trip has neither destination nor dates", () => {
    const { container } = setup({ ...trip, destination: undefined, dates: undefined });

    expect(container.querySelector(".landing-next-meta")).toBeNull();
  });

  it("renders a skeleton, not a number, while the countdown clock is unknown", () => {
    const { container } = setup({ ...trip, countdown: null });

    expect(container.querySelector(".landing-next-value")).toBeNull();
    expect(container.querySelectorAll(".ui-skeleton")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Ver el viaje" })).toBeInTheDocument();
  });

  it("server markup holds no day number for a trip whose countdown is not known yet", () => {
    const html = renderToStaticMarkup(
      <LandingHero
        media={null}
        greeting="Hola"
        tagline="t"
        next={{ ...trip, name: "Bariloche", dates: undefined, countdown: null }}
      />,
    );

    expect(html).not.toMatch(/landing-next-value/);
    expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/\d/);
  });

  it("shows a layout-shaped loading skeleton labelled for assistive tech", () => {
    const { container } = setup({ status: "loading", label: "Buscando tu próximo viaje" });

    // aria-label is only permitted on an element with a role: a bare div would fail axe.
    const busy = screen.getByRole("status", { name: "Buscando tu próximo viaje" });
    expect(busy).toBe(container.querySelector("[aria-busy='true']"));
    expect(busy.querySelector(".landing-next-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the empty state with its title as an h2 and no countdown or link", () => {
    setup({ status: "empty", title: "Todavía no hay un viaje", body: "Armá uno" });

    expect(screen.getByRole("heading", { level: 2, name: "Todavía no hay un viaje" })).toBeInTheDocument();
    expect(screen.getByText("Armá uno")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows an alert with a retry for a failed fetch", () => {
    const onRetry = vi.fn();
    setup({ status: "error", message: "No pudimos cargar", retryLabel: "Reintentar", onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
