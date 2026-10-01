import { describe, expect, it } from "vitest";
import { isBackwards, needsConfirm, transitionLabelKey } from "./status";

describe("transition helpers", () => {
  it("flags only real backwards moves", () => {
    expect(isBackwards("chosen", "discussing")).toBe(true);
    expect(isBackwards("booked", "chosen")).toBe(true);
    expect(isBackwards("discussing", "proposed")).toBe(true);
    expect(isBackwards("proposed", "discussing")).toBe(false);
    expect(isBackwards("chosen", "booked")).toBe(false);
    // Reopening a discarded proposal and discarding are not "backwards".
    expect(isBackwards("discarded", "proposed")).toBe(false);
    expect(isBackwards("chosen", "discarded")).toBe(false);
  });

  it("asks for confirmation on discard and on backwards moves only", () => {
    expect(needsConfirm("proposed", "discarded")).toBe(true);
    expect(needsConfirm("chosen", "discussing")).toBe(true);
    expect(needsConfirm("proposed", "chosen")).toBe(false);
    expect(needsConfirm("discarded", "proposed")).toBe(false);
  });

  it("picks the label key for each edge", () => {
    expect(transitionLabelKey("booked", "chosen")).toBe("unbook");
    expect(transitionLabelKey("chosen", "discussing")).toBe("reopen");
    expect(transitionLabelKey("proposed", "chosen")).toBe("chosen");
    expect(transitionLabelKey("discarded", "proposed")).toBe("proposed");
    expect(transitionLabelKey("chosen", "booked")).toBe("booked");
  });
});
