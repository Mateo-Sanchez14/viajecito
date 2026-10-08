import { SCENE_FOR_KIND, inferSceneKind } from "./sceneKeywords";

export type CoverScene = "road" | "beach" | "snow" | "city";

/** Scenes a trip falls back to when it has no ski type, in a fixed order the hash indexes into. */
const DEFAULT_SCENES = ["road", "city", "beach"] as const satisfies readonly CoverScene[];

/** FNV-1a: tiny, stable across runtimes, good enough to spread uuids over three buckets. */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result;
}

type SceneSource = { type: string; name?: string; destination_label?: string };

/**
 * The scene the trip's words point to, or `null` when they name nothing we recognise: `ski` always
 * means snow; otherwise the destination (then the name) is read for place keywords, so a beach town
 * gets the beach, Bariloche the snow and Mendoza the vineyard road.
 */
export function inferCoverScene(trip: SceneSource): CoverScene | null {
  if (trip.type === "ski") return "snow";
  const kind = inferSceneKind(trip.destination_label ?? "") ?? inferSceneKind(trip.name ?? "");
  return kind ? SCENE_FOR_KIND[kind] : null;
}

/**
 * The scene a trip gets when it has no photo: what its words point to, else a stable pick from
 * road / city / beach derived from the trip id, so a trip never changes scene just by being listed again.
 */
export function coverScene(trip: SceneSource & { id: string }): CoverScene {
  return inferCoverScene(trip) ?? DEFAULT_SCENES[hash(trip.id) % DEFAULT_SCENES.length];
}
