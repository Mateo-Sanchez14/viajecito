"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { markTourSeen } from "../api/tour";

/**
 * Persists the seen version, then refreshes the server-fetched `me`. A failure is swallowed on
 * purpose: the person just sees the tour again next session, which beats an error about onboarding.
 */
export function useMarkTourSeen() {
  const router = useRouter();
  return useMutation({
    mutationFn: markTourSeen,
    onSuccess: () => router.refresh(),
    onError: () => {},
  });
}
