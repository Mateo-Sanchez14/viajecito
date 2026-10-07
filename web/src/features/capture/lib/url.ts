import { normalizeUrl } from "@/features/proposals/lib/form";

/** The http(s) URL a person typed (a bare `www.` host gets https), or null when it is not one. */
export function parseCaptureUrl(raw: string): string | null {
  const value = normalizeUrl(raw);
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
