"use client";

import { useState } from "react";
import { ambientClip } from "@/ui/ambient/scenes";
import { Photo } from "@/ui/atoms/Photo";
import { TripCoverArt } from "@/ui/illustrations/TripCoverArt";
import { AmbientVideo } from "@/ui/molecules/AmbientVideo";
import { coverScene, footageScene, tripPhoto } from "../lib/coverScene";

type TripSceneMediaProps = {
  trip: { id: string; type: string; name?: string; destination_label?: string };
  /** Whether footage may play at all (motion allowed, no data saving). */
  allowMotion: boolean;
};

const HERO_SIZES = "(min-width: 900px) 55vw, 100vw";

/**
 * The hero picture of a trip that has no cover photo: the photo of its scene, loaded eagerly and at
 * high priority because it is the first thing on screen, with the generic footage playing over it where
 * the footage fits the place. If the photo cannot load, the illustration (with the footage's own still)
 * takes its place.
 */
export function TripSceneMedia({ trip, allowMotion }: TripSceneMediaProps) {
  const photo = tripPhoto(trip);
  const footage = footageScene(trip);
  const clip = footage ? ambientClip(footage) : null;
  const [failedId, setFailedId] = useState<string | null>(null);
  const showPhoto = photo !== null && failedId !== photo.id;

  return (
    <>
      {showPhoto ? (
        <Photo photo={photo} priority sizes={HERO_SIZES} className="trip-hero-photo" onError={() => setFailedId(photo.id)} />
      ) : (
        <TripCoverArt scene={coverScene(trip)} live />
      )}
      {clip && <AmbientVideo src={clip.mp4} poster={showPhoto ? undefined : clip.poster} play={allowMotion} />}
    </>
  );
}
