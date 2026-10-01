"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pushKeys, putPreferences, sendTestPush, type PushPreferences } from "../api/push";

export function useSavePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preferences: PushPreferences) => putPreferences(preferences),
    onSuccess: (saved) => queryClient.setQueryData(pushKeys.preferences, saved),
  });
}

export function useSendTestPush() {
  return useMutation({ mutationFn: sendTestPush });
}
