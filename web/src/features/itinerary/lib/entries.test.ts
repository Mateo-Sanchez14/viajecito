import { expect, it } from "vitest";
import { validateEntry, optimisticMove } from "./entries";
it("rejects missing title, invalid local times, time without a day and invalid coordinates", () => {
  expect(validateEntry({ title: " " })).toBe("invalid_request");
  expect(validateEntry({ title: "Meet", start_time: "10:00" })).toBe(
    "invalid_times",
  );
  expect(
    validateEntry({
      title: "Meet",
      day_date: "2026-10-01",
      start_time: "10:00",
      end_time: "09:00",
    }),
  ).toBe("invalid_times");
  expect(validateEntry({ title: "Meet", lat: 91 })).toBe("invalid_request");
  expect(
    validateEntry({
      title: "Meet",
      day_date: "2026-10-01",
      start_time: "09:00",
    }),
  ).toBeNull();
});
it("optimistically swaps untimed entries but never crosses different timed classes", () => {
  const entries = [
    { id: "a", starts_at: null, position: 0 },
    { id: "b", starts_at: null, position: 1 },
  ];
  expect(optimisticMove(entries, "b", "up").map((e) => e.id)).toEqual([
    "b",
    "a",
  ]);
  expect(
    optimisticMove(
      [
        { ...entries[0], starts_at: "09:00" },
        { ...entries[1], starts_at: "10:00" },
      ],
      "b",
      "up",
    ).map((e) => e.id),
  ).toEqual(["a", "b"]);
});
it("never optimistically reorders across separate out-of-range days", () => {
  const entries = [
    { id: "a", starts_at: null, position: 0, day_date: "2026-09-01" },
    { id: "b", starts_at: null, position: 0, day_date: "2026-09-02" },
  ];
  expect(optimisticMove(entries, "b", "up")).toEqual(entries);
});
