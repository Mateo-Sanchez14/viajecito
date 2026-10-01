"use client";

import { useQuery } from "@tanstack/react-query";
import { getPreferences, getVapidPublicKey, listSubscriptions, pushKeys } from "../api/push";

export function useVapidKey() {
  return useQuery({ queryKey: pushKeys.vapid, queryFn: getVapidPublicKey, staleTime: Infinity });
}

export function usePushSubscriptions() {
  return useQuery({ queryKey: pushKeys.subscriptions, queryFn: listSubscriptions });
}

export function usePushPreferences({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: pushKeys.preferences, queryFn: getPreferences, enabled });
}
