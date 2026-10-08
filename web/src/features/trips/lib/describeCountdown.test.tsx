import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { describeCountdown } from "./describeCountdown";

const t = (key: string, values?: Record<string, number>) => (values ? `${key}:${JSON.stringify(values)}` : key);

describe("describeCountdown", () => {
  it("counts days with the plural unit for a trip 10 days away", () => {
    expect(describeCountdown({ kind: "upcoming", days: 10 }, t, null)).toEqual({
      value: "10",
      count: 10,
      unit: 'upcomingUnit:{"days":10}',
      caption: "upcomingCaption",
    });
  });

  it("says tomorrow instead of '1 días'", () => {
    const result = describeCountdown({ kind: "upcoming", days: 1 }, t, null);

    expect(result).toEqual({ value: "tomorrow", caption: "tomorrowCaption" });
    expect(result.unit).toBeUndefined();
  });

  it("says leaving today on the start day", () => {
    expect(describeCountdown({ kind: "today" }, t, null)).toEqual({ value: "today", caption: "todayCaption" });
  });

  it("shows the trip day and the total while ongoing", () => {
    expect(describeCountdown({ kind: "ongoing", day: 3, total: 8 }, t, null)).toEqual({
      value: 'ongoing:{"day":3}',
      unit: 'ongoingUnit:{"total":8}',
      caption: "ongoingCaption",
    });
  });

  it("shows finished, never a negative number", () => {
    const result = describeCountdown({ kind: "done" }, t, null);

    expect(result).toEqual({ value: "done", caption: "doneCaption" });
    expect(result.value).not.toMatch(/-\d/);
  });

  it("prompts to set the dates, with the link only when the trip has a dates module", () => {
    expect(describeCountdown({ kind: "undated" }, t, null).action).toBeUndefined();

    const linked = describeCountdown({ kind: "undated" }, t, "/trip/dates");
    render(<>{linked.action}</>);

    expect(linked.value).toBe("undated");
    expect(screen.getByRole("link", { name: "setDates" })).toHaveAttribute("href", "/trip/dates");
  });
});
