import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListSkeleton } from "./ListSkeleton";

describe("ListSkeleton", () => {
  it("renders a hero block and three rows by default, all decorative", () => {
    const { container } = render(<ListSkeleton />);

    expect(container.querySelectorAll("[data-skeleton='hero']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-skeleton='row']")).toHaveLength(3);
    container.querySelectorAll(".ui-skeleton").forEach((block) => expect(block).toHaveAttribute("aria-hidden", "true"));
  });

  it("can drop the hero and change the row count", () => {
    const { container } = render(<ListSkeleton hero={false} rows={5} />);

    expect(container.querySelectorAll("[data-skeleton='hero']")).toHaveLength(0);
    expect(container.querySelectorAll("[data-skeleton='row']")).toHaveLength(5);
  });
});
