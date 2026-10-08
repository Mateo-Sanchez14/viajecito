"use client";

import { useState } from "react";
import { ambientClip } from "@/ui/ambient/scenes";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { coverPath } from "../api/cover";
import type { TripSummary } from "../api/trips";
import { useCoverFallback } from "../hooks/useCoverFallback";
import { coverScene } from "../lib/coverScene";

/**
 * The picture of a trip card, best available first: the group's own cover photo, then the still of
 * the scene the destination points to (the same frame the hero footage starts from) and finally the
 * flat illustration, which is also where a photo or still that fails to load lands.
 */
export function TripCardMedia({ trip }: { trip: TripSummary }) {
  const cover = useCoverFallback(trip);
  const scene = coverScene(trip);
  const poster = ambientClip(scene)?.poster ?? null;
  const [failedPoster, setFailedPoster] = useState<string | null>(null);

  if (cover.showPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authorized endpoint: next/image cannot forward the session
      <img
        src={coverPath(trip)}
        alt=""
        loading="lazy"
        decoding="async"
        className="trip-card-photo"
        onError={cover.onError}
      />
    );
  }
  if (poster && failedPoster !== poster) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- self-hosted static still, already sized and cached immutably
      <img
        src={poster}
        alt=""
        loading="lazy"
        decoding="async"
        className="trip-card-photo"
        data-scene={scene}
        onError={() => setFailedPoster(poster)}
      />
    );
  }
  return <TripCoverArt scene={scene} />;
}
