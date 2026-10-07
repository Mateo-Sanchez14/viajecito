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

/**
 * The cover illustration for a trip: `ski` always gets snow; every other type (known or not) gets
 * a stable pick from road / city / beach derived from the trip id, so a trip keeps its scene.
 */
export function coverScene(trip: { id: string; type: string }): CoverScene {
  if (trip.type === "ski") return "snow";
  return DEFAULT_SCENES[hash(trip.id) % DEFAULT_SCENES.length];
}
