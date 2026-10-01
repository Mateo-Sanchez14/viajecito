import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import type { Answer, CellValue } from "../lib/calendar";
import { AvailabilityGrid } from "./AvailabilityGrid";

const t = messages.dates.grid;
// Two full weeks, Monday 5 July to Sunday 18 July 2027.
const DATES = Array.from({ length: 14 }, (_, i) => `2027-07-${String(5 + i).padStart(2, "0")}`);

const longDay = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
const label = (iso: string, answer: string) => t.cellLabel.replace("{day}", longDay(iso)).replace("{answer}", answer);
const cell = (iso: string, answer: string = t.legend.empty) => screen.getByRole("gridcell", { name: label(iso, answer) });

function setup(answers: Record<string, Answer> = {}, props: { disabled?: boolean } = {}) {
  const onChange = vi.fn<(changes: Record<string, CellValue>) => void>();
  renderWithProviders(<AvailabilityGrid dates={DATES} answers={answers} onChange={onChange} {...props} />);
  return onChange;
}

afterEach(() => {
  // jsdom has no elementFromPoint; individual tests stub it.
  Reflect.deleteProperty(document, "elementFromPoint");
});

describe("AvailabilityGrid layout", () => {
  it("renders a grid with a header and one row per Monday-first week", () => {
    setup();

    const grid = screen.getByRole("grid", { name: t.label });
    expect(within(grid).getAllByRole("columnheader")).toHaveLength(7);
    expect(within(grid).getAllByRole("row")).toHaveLength(3); // header + 2 weeks
    expect(within(grid).getAllByRole("gridcell").filter((c) => c.hasAttribute("data-date"))).toHaveLength(14);
    expect(within(grid).getAllByRole("columnheader")[0]).toHaveTextContent("lun");
  });

  it("labels every cell with the day and the answer, never colour only", () => {
    setup({ "2027-07-05": "yes", "2027-07-06": "maybe", "2027-07-07": "no" });

    expect(cell("2027-07-05", t.legend.yes)).toHaveTextContent("✓");
    expect(cell("2027-07-06", t.legend.maybe)).toHaveTextContent("~");
    expect(cell("2027-07-07", t.legend.no)).toHaveTextContent("✕");
    expect(cell("2027-07-08")).not.toHaveTextContent(/[✓~✕]/);
  });

  it("shades weekends and keeps cells at least 44px tall", () => {
    setup();

    expect(cell("2027-07-10")).toHaveAttribute("data-weekend", "true");
    expect(cell("2027-07-10")).toHaveClass("bg-foreground/5");
    expect(cell("2027-07-12")).toHaveAttribute("data-weekend", "false");
    expect(cell("2027-07-12")).not.toHaveClass("bg-foreground/5");
    expect(cell("2027-07-12")).toHaveClass("min-h-11");
  });
});

describe("AvailabilityGrid tap", () => {
  it("cycles empty, yes, maybe, no and back to empty", () => {
    const onChange = setup({ "2027-07-06": "yes", "2027-07-07": "maybe", "2027-07-08": "no" });

    fireEvent.click(cell("2027-07-05"));
    fireEvent.click(cell("2027-07-06", t.legend.yes));
    fireEvent.click(cell("2027-07-07", t.legend.maybe));
    fireEvent.click(cell("2027-07-08", t.legend.no));

    expect(onChange.mock.calls.map(([changes]) => changes)).toEqual([
      { "2027-07-05": "yes" },
      { "2027-07-06": "maybe" },
      { "2027-07-07": "no" },
      { "2027-07-08": null },
    ]);
  });

  it("ignores taps when disabled", () => {
    const onChange = setup({}, { disabled: true });

    fireEvent.click(cell("2027-07-05"));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("AvailabilityGrid paint", () => {
  function stubPointAt(iso: string) {
    document.elementFromPoint = vi.fn(() => document.querySelector(`[data-date="${iso}"]`));
  }

  it("paints every cell crossed in paint mode with the picked value", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: t.paint }));
    fireEvent.click(screen.getByRole("button", { name: t.legend.no }));

    const grid = screen.getByRole("grid");
    fireEvent.pointerDown(cell("2027-07-05"), { pointerId: 1, pointerType: "touch" });
    stubPointAt("2027-07-06");
    fireEvent.pointerMove(grid, { pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10 });
    stubPointAt("2027-07-07");
    fireEvent.pointerMove(grid, { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 10 });
    fireEvent.pointerUp(grid, { pointerId: 1, pointerType: "touch" });

    expect(onChange.mock.calls.map(([changes]) => changes)).toEqual([
      { "2027-07-05": "no" },
      { "2027-07-06": "no" },
      { "2027-07-07": "no" },
    ]);
  });

  it("does not paint the same cell twice while the pointer stays on it", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: t.paint }));

    fireEvent.pointerDown(cell("2027-07-05"), { pointerId: 1 });
    stubPointAt("2027-07-05");
    fireEvent.pointerMove(screen.getByRole("grid"), { pointerId: 1, clientX: 1, clientY: 1 });
    fireEvent.pointerUp(screen.getByRole("grid"), { pointerId: 1 });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("clears days when the clear value is picked", () => {
    const onChange = setup({ "2027-07-05": "yes" });
    fireEvent.click(screen.getByRole("button", { name: t.paint }));
    fireEvent.click(screen.getByRole("button", { name: t.legend.clear }));

    fireEvent.pointerDown(cell("2027-07-05", t.legend.yes), { pointerId: 1 });
    fireEvent.pointerUp(screen.getByRole("grid"), { pointerId: 1 });

    expect(onChange).toHaveBeenCalledWith({ "2027-07-05": null });
  });

  it("paints on a mouse drag even without paint mode, and the click that follows does not cycle", () => {
    const onChange = setup();

    fireEvent.pointerDown(cell("2027-07-05"), { pointerId: 1, pointerType: "mouse" });
    stubPointAt("2027-07-06");
    fireEvent.pointerMove(screen.getByRole("grid"), { pointerId: 1, pointerType: "mouse", clientX: 5, clientY: 5 });
    fireEvent.pointerUp(screen.getByRole("grid"), { pointerId: 1, pointerType: "mouse" });
    fireEvent.click(cell("2027-07-06"));

    expect(onChange.mock.calls.map(([changes]) => changes)).toEqual([
      { "2027-07-05": "yes" },
      { "2027-07-06": "yes" },
    ]);
  });

  it("does not paint on a touch drag without paint mode, so the page can scroll", () => {
    const onChange = setup();

    fireEvent.pointerDown(cell("2027-07-05"), { pointerId: 1, pointerType: "touch" });
    stubPointAt("2027-07-06");
    fireEvent.pointerMove(screen.getByRole("grid"), { pointerId: 1, pointerType: "touch", clientX: 5, clientY: 5 });
    fireEvent.pointerUp(screen.getByRole("grid"), { pointerId: 1, pointerType: "touch" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores pointer moves when no gesture is active", () => {
    const onChange = setup();
    stubPointAt("2027-07-06");

    fireEvent.pointerMove(screen.getByRole("grid"), { pointerId: 1, clientX: 5, clientY: 5 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("exposes the paint mode state to assistive tech", () => {
    setup();
    const toggle = screen.getByRole("button", { name: t.paint });

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AvailabilityGrid keyboard", () => {
  it("has a single tab stop that moves with the arrow keys", () => {
    setup();
    const first = cell("2027-07-05");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(cell("2027-07-06")).toHaveAttribute("tabindex", "-1");

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(cell("2027-07-06")).toHaveFocus();
    expect(cell("2027-07-06")).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(cell("2027-07-06"), { key: "ArrowDown" });
    expect(cell("2027-07-13")).toHaveFocus();
    fireEvent.keyDown(cell("2027-07-13"), { key: "ArrowLeft" });
    expect(cell("2027-07-12")).toHaveFocus();
    fireEvent.keyDown(cell("2027-07-12"), { key: "ArrowUp" });
    expect(cell("2027-07-05")).toHaveFocus();
  });

  it("cycles the focused day with Space and Enter", () => {
    const onChange = setup();

    fireEvent.keyDown(cell("2027-07-05"), { key: " " });
    fireEvent.keyDown(cell("2027-07-05"), { key: "Enter" });

    expect(onChange.mock.calls.map(([changes]) => changes)).toEqual([
      { "2027-07-05": "yes" },
      { "2027-07-05": "yes" },
    ]);
  });

  it("extends the focused answer to the next day with Shift+arrow", () => {
    const onChange = setup({ "2027-07-05": "maybe" });

    const origin = cell("2027-07-05", t.legend.maybe);
    origin.focus();
    fireEvent.keyDown(origin, { key: "ArrowRight", shiftKey: true });

    expect(onChange).toHaveBeenCalledWith({ "2027-07-06": "maybe" });
    expect(cell("2027-07-06")).toHaveFocus();
  });

  it("clears the focused day with Delete", () => {
    const onChange = setup({ "2027-07-05": "yes" });

    fireEvent.keyDown(cell("2027-07-05", t.legend.yes), { key: "Delete" });

    expect(onChange).toHaveBeenCalledWith({ "2027-07-05": null });
  });
});
