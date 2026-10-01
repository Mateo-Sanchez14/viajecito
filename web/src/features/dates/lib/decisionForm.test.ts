import { describe, expect, it } from "vitest";
import { parseDecisionForm, type DecisionFormValues } from "./decisionForm";

const NOW = new Date("2027-06-01T12:00:00Z");
const valid: DecisionFormValues = {
  from: "2027-07-01",
  to: "2027-08-15",
  minDays: "7",
  maxDays: "",
  deadline: "",
  maybeWeight: "0.5",
};
const parse = (overrides: Partial<DecisionFormValues> = {}) => parseDecisionForm({ ...valid, ...overrides }, NOW);

describe("parseDecisionForm", () => {
  it("accepts a valid form; max days defaults to the minimum and the weight is a two-decimal string", () => {
    expect(parse()).toEqual({
      ok: true,
      value: {
        window_start: "2027-07-01",
        window_end: "2027-08-15",
        min_days: 7,
        max_days: 7,
        maybe_weight: "0.50",
        deadline: null,
      },
    });
  });

  it("converts a future deadline to an ISO instant", () => {
    const result = parse({ deadline: "2027-06-20T18:00" });

    expect(result).toMatchObject({ ok: true, value: { deadline: new Date("2027-06-20T18:00").toISOString() } });
  });

  it.each([
    ["rangeRequired", { from: "" }],
    ["rangeRequired", { to: "" }],
    ["endBeforeStart", { from: "2027-08-02", to: "2027-08-01" }],
    ["rangeTooLong", { from: "2027-01-01", to: "2027-07-01" }],
    ["minDaysInvalid", { minDays: "0" }],
    ["minDaysInvalid", { minDays: "61" }],
    ["minDaysInvalid", { minDays: "x" }],
    ["maxDaysInvalid", { minDays: "7", maxDays: "5" }],
    ["maxDaysInvalid", { maxDays: "61" }],
    ["minExceedsRange", { from: "2027-07-01", to: "2027-07-05", minDays: "7" }],
    ["deadlinePast", { deadline: "2027-05-01T10:00" }],
    ["weightInvalid", { maybeWeight: "1.5" }],
    ["weightInvalid", { maybeWeight: "" }],
  ] as const)("rejects with %s", (key, overrides) => {
    const result = parse(overrides);

    expect(result.ok).toBe(false);
    expect(Object.values(result.ok ? {} : result.errors)).toContain(key);
  });

  it("allows a range of exactly 180 days and a trip as long as the range", () => {
    expect(parse({ from: "2027-01-01", to: "2027-06-30" }).ok).toBe(true); // 180 days apart
    expect(parse({ from: "2027-07-01", to: "2027-07-07", minDays: "7" }).ok).toBe(true);
  });
});
