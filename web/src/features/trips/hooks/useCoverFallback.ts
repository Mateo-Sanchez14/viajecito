import { useState } from "react";

/**
 * Whether to show a trip's cover photo. The photo that failed to load is remembered by version:
 * offline (the service worker keeps /api network-only) or after the file went missing. A new
 * `cover_version` gets a fresh try.
 */
export function useCoverFallback(trip: { has_cover: boolean; cover_version: number } | null) {
  const [failedVersion, setFailedVersion] = useState<number | null>(null);
  return {
    showPhoto: !!trip && trip.has_cover && failedVersion !== trip.cover_version,
    onError: () => {
      if (trip) setFailedVersion(trip.cover_version);
    },
  };
}
