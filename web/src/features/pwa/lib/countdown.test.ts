import { describe, expect, it } from "vitest";
import { daysUntil } from "./countdown";

const BA = "America/Argentina/Buenos_Aires"; // UTC-3, no DST
const SYDNEY = "Australia/Sydney"; // UTC+10/+11

describe("daysUntil", () => {
  it("counts whole calendar days between the trip-local today and the start day", () => {
    expect(daysUntil("2027-07-01", BA, new Date("2027-06-08T15:00:00Z"))).toBe(23);
  });

  it("uses the trip time zone for 'today', not UTC", () => {
    // 01:30 UTC on Jun 8 is still Jun 7 in Buenos Aires.
    expect(daysUntil("2027-06-08", BA, new Date("2027-06-08T01:30:00Z"))).toBe(1);
    // Same instant in Sydney is already Jun 8 midday.
    expect(daysUntil("2027-06-08", SYDNEY, new Date("2027-06-08T01:30:00Z"))).toBe(0);
  });

  it("is 0 on the start day and negative afterwards", () => {
    expect(daysUntil("2027-07-01", BA, new Date("2027-07-01T12:00:00Z"))).toBe(0);
    expect(daysUntil("2027-07-01", BA, new Date("2027-07-03T12:00:00Z"))).toBe(-2);
  });

  it("survives a DST change in the trip zone", () => {
    expect(daysUntil("2027-11-01", "America/New_York", new Date("2027-10-30T12:00:00Z"))).toBe(2);
  });
});
