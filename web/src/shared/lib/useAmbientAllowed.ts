"use client";

import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useSaveData } from "./useSaveData";

/**
 * Whether decorative video may play: motion is allowed and no data saving was requested. The
 * server snapshot is `false`, so no `<video>` is ever in server markup and hydration never mismatches.
 */
export function useAmbientAllowed(): boolean {
  const reduced = usePrefersReducedMotion();
  const saveData = useSaveData();
  return !reduced && !saveData;
}
