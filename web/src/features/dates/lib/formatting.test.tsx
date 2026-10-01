import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/errors";
import messages from "../../../../messages/es-AR";
import { useDatesError } from "./useDatesError";
import { useDayFormat } from "./useDayFormat";

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="es-AR" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

describe("useDayFormat", () => {
  it("formats ISO days in UTC so they never shift", () => {
    const { result } = renderHook(() => useDayFormat(), { wrapper });

    expect(result.current.short("2027-07-10")).toBe("10 jul");
    expect(result.current.long("2027-07-10")).toBe("sáb, 10 de julio");
    expect(result.current.weekday("2027-07-10")).toBe("sáb");
    expect(result.current.dayOfMonth("2027-07-10")).toBe("10");
  });

  it("compacts a range inside one month", () => {
    const { result } = renderHook(() => useDayFormat(), { wrapper });

    expect(result.current.range("2027-07-12", "2027-07-19")).toBe("12–19 jul");
    expect(result.current.range("2027-07-28", "2027-08-04")).toBe("28 jul–4 ago");
  });

  it("formats an instant as a short date and time", () => {
    const { result } = renderHook(() => useDayFormat(), { wrapper });

    expect(result.current.dateTime("2027-07-10T15:30:00Z")).toMatch(/10 jul/);
  });
});

describe("useDatesError", () => {
  it("maps an api code to its copy", () => {
    const { result } = renderHook(() => useDatesError(), { wrapper });

    expect(result.current(new ApiError("decision_closed", 409))).toBe(messages.dates.errors.decision_closed);
    expect(result.current(new ApiError("invalid_window", 400))).toBe(messages.dates.errors.invalid_window);
  });

  it("falls back to the generic message for unknown codes and non-api errors", () => {
    const { result } = renderHook(() => useDatesError(), { wrapper });

    expect(result.current(new ApiError("mystery", 500))).toBe(messages.dates.errors.unknown);
    expect(result.current(new Error("boom"))).toBe(messages.dates.errors.unknown);
    expect(result.current(null)).toBe(messages.dates.errors.unknown);
  });
});
