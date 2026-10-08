/**
 * A name proposed from what the person already typed: the place (the part before the first comma,
 * so "Bariloche, Río Negro" becomes "Bariloche") and, when there is a start date, its month and
 * year ("Bariloche jul 2027"). Empty until there is a destination.
 */
export function suggestTripName(destination: string, whenLabel: string | null): string {
  const place = destination.split(",")[0].trim();
  if (!place) return "";
  return whenLabel ? `${place} ${whenLabel}` : place;
}
