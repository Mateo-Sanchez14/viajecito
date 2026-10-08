import { hashSeed, pickScenePhoto, type Photo } from "@/ui/photos/photos";
import { SCENE_FOR_KIND, inferSceneKind, type SceneKind } from "./sceneKeywords";

/** The coarse scenes of the illustrations and the ambient footage. Photos use the finer `SceneKind`. */
export type CoverScene = "road" | "beach" | "snow" | "city";

/** Kinds a trip falls back to when it names nothing recognisable, in a fixed order the hash indexes into. */
const DEFAULT_KINDS = ["road", "city", "beach"] as const satisfies readonly SceneKind[];

/** The kinds whose generic footage fits the place; the others show only their photo. */
const FOOTAGE_FOR_KIND: Partial<Record<SceneKind, CoverScene>> = { snow: "snow", beach: "beach", road: "road" };

type SceneSource = { type: string; name?: string; destination_label?: string };

/**
 * The kind of place the trip's words point to, or `null` when they name nothing we recognise: `ski`
 * always means snow; otherwise the destination (then the name) is read for place keywords, so a beach
 * town is a beach, Bariloche snow, Mendoza a vineyard and Ruta 40 a road.
 */
export function inferTripKind(trip: SceneSource): SceneKind | null {
  if (trip.type === "ski") return "snow";
  return inferSceneKind(trip.destination_label ?? "") ?? inferSceneKind(trip.name ?? "");
}

/**
 * What the trip looks like: what its words point to, else a stable pick from road / city / beach
 * derived from the trip id, so a trip never changes scene just by being listed again.
 */
export function sceneKind(trip: SceneSource & { id: string }): SceneKind {
  return inferTripKind(trip) ?? DEFAULT_KINDS[hashSeed(trip.id) % DEFAULT_KINDS.length];
}

/** The illustration scene of a trip (the photo scenes folded into the four we draw). */
export function coverScene(trip: SceneSource & { id: string }): CoverScene {
  return SCENE_FOR_KIND[sceneKind(trip)];
}

/** The scene photo of a trip (a stable pick when its scene has two), or `null` without one. */
export function tripPhoto(trip: SceneSource & { id: string }): Photo | null {
  return pickScenePhoto(sceneKind(trip), trip.id);
}

/** The ambient footage scene for a trip, only where the generic clip fits the place. */
export function footageScene(trip: SceneSource & { id: string }): CoverScene | null {
  return FOOTAGE_FOR_KIND[sceneKind(trip)] ?? null;
}
