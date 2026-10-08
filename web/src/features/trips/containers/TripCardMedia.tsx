"use client";

import { useState } from "react";
import { useSaveData } from "@/shared/lib/useSaveData";
import { Photo } from "@/ui/atoms/Photo";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { coverPath } from "../api/cover";
import type { TripSummary } from "../api/trips";
import { useCoverFallback } from "../hooks/useCoverFallback";
import { coverScene, tripPhoto } from "../lib/coverScene";

const CARD_SIZES = "(min-width: 768px) 360px, 78vw";

/**
 * The picture of a trip card, best available first: the group's own cover photo, then the photo of the
 * scene the destination points to (a stable pick when the scene has two) and finally the flat
 * illustration, which is also where a photo that fails to load lands. The caption below names the
 * trip, so every picture here is decorative (empty alt).
 */
export function TripCardMedia({ trip }: { trip: TripSummary }) {
  const cover = useCoverFallback(trip);
  const saveData = useSaveData();
  const photo = tripPhoto(trip);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);

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
  if (photo && failedPhoto !== photo.id) {
    return (
      <Photo
        photo={photo}
        small={saveData}
        sizes={CARD_SIZES}
        className="trip-card-photo"
        onError={() => setFailedPhoto(photo.id)}
      />
    );
  }
  return <TripCoverArt scene={coverScene(trip)} />;
}
