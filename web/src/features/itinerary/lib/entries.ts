import type { EntryCreate } from "../api/itinerary";
export function validateEntry(
  value: EntryCreate,
): "invalid_request" | "invalid_times" | null {
  if (
    !value.title.trim() ||
    value.title.length > 200 ||
    (value.notes?.length ?? 0) > 1000 ||
    (value.location_label?.length ?? 0) > 200
  )
    return "invalid_request";
  if (
    (value.lat != null &&
      (!Number.isFinite(value.lat) || Math.abs(value.lat) > 90)) ||
    (value.lng != null &&
      (!Number.isFinite(value.lng) || Math.abs(value.lng) > 180))
  )
    return "invalid_request";
  const times = [value.start_time, value.end_time].filter((v): v is string =>
    Boolean(v),
  );
  if (
    (times.length && !value.day_date) ||
    times.some((v) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ||
    (value.end_time && (!value.start_time || value.end_time < value.start_time))
  )
    return "invalid_times";
  return null;
}
/** Match the server's reorder classes; never show a timed item crossing another time. */
export function optimisticMove<
  T extends {
    id: string;
    starts_at: string | null;
    position: number;
    day_date?: string | null;
  },
>(entries: T[], id: string, direction: "up" | "down"): T[] {
  const index = entries.findIndex((entry) => entry.id === id);
  const neighbour = index + (direction === "up" ? -1 : 1);
  if (
    index < 0 ||
    neighbour < 0 ||
    neighbour >= entries.length ||
    entries[index].day_date !== entries[neighbour].day_date ||
    entries[index].starts_at !== entries[neighbour].starts_at
  )
    return entries;
  const result = [...entries];
  [result[index], result[neighbour]] = [result[neighbour], result[index]];
  let position = 0;
  return result.map((entry) =>
    entry.day_date === entries[index].day_date
      ? { ...entry, position: position++ }
      : entry,
  );
}
