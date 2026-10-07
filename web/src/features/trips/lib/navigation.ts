import type { TripStatus } from "../api/trips";

/** Sections promoted to the bottom bar while the trip is still being planned. */
export const PRIMARY_PLANNING = ["proposals", "logistics", "itinerary"] as const;
/** Sections promoted to the bottom bar once the trip is under way. */
export const PRIMARY_ONGOING = ["today", "itinerary", "documents"] as const;

/**
 * Splits the trip sections between the bottom bar and its "more" sheet. Overview always leads;
 * the phase's preferred keys come next (in that order, when the trip has the module), then the
 * remaining sections in module order fill the bar up to `maxPrimary`. Whatever is left goes to
 * `more`, except a single leftover, which joins the bar so the sheet never holds one lone item.
 */
export function splitNav<T extends { key: string }>(
  items: T[],
  status: TripStatus,
  maxPrimary = 4,
): { primary: T[]; more: T[] } {
  const preferred = status === "ongoing" ? PRIMARY_ONGOING : PRIMARY_PLANNING;
  const overview = items.find((item) => item.key === "overview");
  const rest = items.filter((item) => item.key !== "overview");

  const primary: T[] = overview ? [overview] : [];
  for (const key of preferred) {
    if (primary.length >= maxPrimary) break;
    const match = rest.find((item) => item.key === key);
    if (match) primary.push(match);
  }
  for (const item of rest) {
    if (primary.length >= maxPrimary) break;
    if (!primary.includes(item)) primary.push(item);
  }

  const more = rest.filter((item) => !primary.includes(item));
  if (more.length === 1) return { primary: [...primary, ...more], more: [] };
  return { primary, more };
}
