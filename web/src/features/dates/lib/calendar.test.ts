import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isWeekend, nextAnswer, stepDate, weekRows } from "./calendar";

describe("nextAnswer", () => {
  it("cycles empty, yes, maybe, no and back to empty", () => {
    expect(nextAnswer(null)).toBe("yes");
    expect(nextAnswer("yes")).toBe("maybe");
    expect(nextAnswer("maybe")).toBe("no");
    expect(nextAnswer("no")).toBeNull();
  });
});

describe("day arithmetic", () => {
  it("adds days across month boundaries without timezone drift", () => {
    expect(addDays("2027-07-30", 3)).toBe("2027-08-02");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("counts the days between two ISO dates", () => {
    expect(daysBetween("2027-07-01", "2027-07-15")).toBe(14);
    expect(daysBetween("2027-07-15", "2027-07-01")).toBe(-14);
  });

  it("flags Saturdays and Sundays", () => {
    expect(isWeekend("2027-07-10")).toBe(true); // Saturday
    expect(isWeekend("2027-07-11")).toBe(true); // Sunday
    expect(isWeekend("2027-07-12")).toBe(false); // Monday
  });
});

describe("weekRows", () => {
  it("groups days into Monday-first weeks padded with nulls outside the range", () => {
    // 2027-07-01 is a Thursday.
    const dates = Array.from({ length: 6 }, (_, i) => addDays("2027-07-01", i)); // Thu .. Tue
    expect(weekRows(dates)).toEqual([
      [null, null, null, "2027-07-01", "2027-07-02", "2027-07-03", "2027-07-04"],
      ["2027-07-05", "2027-07-06", null, null, null, null, null],
    ]);
  });

  it("returns no rows for no dates", () => {
    expect(weekRows([])).toEqual([]);
  });
});

describe("stepDate", () => {
  const dates = ["2027-07-05", "2027-07-06", "2027-07-07", "2027-07-12"];

  it("moves one day with left and right, one week with up and down", () => {
    expect(stepDate(dates, "2027-07-06", "ArrowRight")).toBe("2027-07-07");
    expect(stepDate(dates, "2027-07-06", "ArrowLeft")).toBe("2027-07-05");
    expect(stepDate(dates, "2027-07-05", "ArrowDown")).toBe("2027-07-12");
    expect(stepDate(dates, "2027-07-12", "ArrowUp")).toBe("2027-07-05");
  });

  it("stays put when the target is outside the range", () => {
    expect(stepDate(dates, "2027-07-05", "ArrowLeft")).toBe("2027-07-05");
    expect(stepDate(dates, "2027-07-06", "ArrowDown")).toBe("2027-07-06");
  });
});
