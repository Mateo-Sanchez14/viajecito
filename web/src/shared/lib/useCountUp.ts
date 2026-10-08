"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const DEFAULT_DURATION_MS = 800;

/**
 * A number that counts up to `target` when it first shows (and glides to a new target if it changes).
 * Under reduced motion, and wherever motion cannot be known (server, engines without matchMedia),
 * it is the final value from the first render: the animation never delays the information.
 */
export function useCountUp(target: number, durationMs = DEFAULT_DURATION_MS): number {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const from = latest.current;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      const eased = 1 - (1 - progress) ** 3; // ease-out cubic: fast start, soft landing
      latest.current = Math.round(from + (target - from) * eased);
      setShown(latest.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);

  return reduced ? target : shown;
}
