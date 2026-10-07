import { parsePrice } from "@/features/proposals/lib/form";

/**
 * A positive amount as the api wants it (a two-place decimal string), or null. It reads the
 * price the way the proposals form does, so "1.500,50" and "45000" work and "0", "-5" or "abc"
 * do not.
 */
export function parseCapturePrice(raw: string): string | null {
  const price = parsePrice(raw);
  if (price === null) return null;
  return Number(price) > 0 ? price : null;
}
