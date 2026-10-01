import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

describe("Select", () => {
  it("renders its options and reports changes", () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="tipo" onChange={onChange} defaultValue="a">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );

    fireEvent.change(screen.getByLabelText("tipo"), { target: { value: "b" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("tipo")).toHaveValue("b");
  });

  it("flags itself as invalid", () => {
    render(
      <Select aria-label="tipo" invalid>
        <option>x</option>
      </Select>,
    );

    expect(screen.getByLabelText("tipo")).toBeInvalid();
  });
});
