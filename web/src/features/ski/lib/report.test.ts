import { describe, expect, it } from "vitest";
import { EMPTY_REPORT, validateReport } from "./report";

describe("validateReport", () => {
  it("always sends status_text, empty when blank", () => {
    expect(validateReport({ ...EMPTY_REPORT, base_cm: "10" })).toEqual({
      ok: true,
      body: { base_cm: 10, status_text: "" },
    });
  });

  it("is empty when nothing is filled", () => {
    expect(validateReport(EMPTY_REPORT)).toMatchObject({ ok: false, form: "empty" });
  });

  it("accepts a comment on its own", () => {
    expect(validateReport({ ...EMPTY_REPORT, status_text: " ok " })).toEqual({ ok: true, body: { status_text: "ok" } });
  });

  it.each(["lifts_open", "lifts_total", "runs_open", "runs_total"] as const)("caps %s at 500", (field) => {
    expect(validateReport({ ...EMPTY_REPORT, [field]: "500" }).ok).toBe(true);
    expect(validateReport({ ...EMPTY_REPORT, [field]: "501" })).toMatchObject({ ok: false, errors: { [field]: "count" } });
  });
});
