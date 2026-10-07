import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatCard } from "./StatCard";

const icon = <svg data-testid="icon" aria-hidden="true" />;

describe("StatCard", () => {
  it("shows the number, what it counts and the detail", () => {
    render(<StatCard icon={icon} value="3" label="van" detail="de 5" />);

    expect(screen.getByText("3")).toHaveClass("ui-tabular");
    expect(screen.getByText("van")).toBeInTheDocument();
    expect(screen.getByText("de 5")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("exposes progress as a named progressbar with min, max and now", () => {
    render(<StatCard icon={icon} value="3" label="van" progress={{ value: 0.6, label: "Gente que confirmó" }} />);

    const bar = screen.getByRole("progressbar", { name: "Gente que confirmó" });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "60");
  });

  it("never renders NaN for an empty total", () => {
    const { container } = render(
      <StatCard icon={icon} value="0" label="tareas" progress={{ value: 0 / 0, label: "Tareas hechas" }} />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(container.innerHTML).not.toContain("NaN");
  });

  it("makes the whole card one link when given an href", () => {
    render(<StatCard icon={icon} value="3" label="van" detail="de 5" href="#rsvp" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#rsvp");
    expect(link).toHaveTextContent("3");
    expect(link).toHaveTextContent("van");
  });

  it("is not a link without an href", () => {
    render(<StatCard icon={icon} value="3" label="van" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders same-shape skeletons while loading, with no text and no link", () => {
    const { container } = render(<StatCard icon={icon} value="3" label="van" href="#rsvp" loading />);

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(container.querySelectorAll(".ui-skeleton").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container).toHaveTextContent("");
  });
});
