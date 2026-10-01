import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title as a heading with subtitle and actions", () => {
    render(
      <PageHeader title="Bariloche" subtitle="1 al 8 de julio" actions={<button>Editar</button>} />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Bariloche" })).toBeInTheDocument();
    expect(screen.getByText("1 al 8 de julio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("omits optional parts", () => {
    render(<PageHeader title="Solo título" />);

    expect(screen.getByRole("heading", { name: "Solo título" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
