"use client";

import { useCountUp } from "@/shared/lib/useCountUp";

type CountUpProps = {
  value: number;
  durationMs?: number;
};

/** An integer that counts up to `value` on mount; the final value at once under reduced motion. */
export function CountUp({ value, durationMs }: CountUpProps) {
  return <>{useCountUp(value, durationMs)}</>;
}
