import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { tripKeys } from "@/features/trips/api/trips";
import {
  closeDecision,
  datesKeys,
  openDecision,
  reopenDecision,
  setAvailability,
  updateDecision,
  type AvailabilityAnswer,
  type CloseDecisionBody,
  type DecisionCreate,
  type DecisionPatch,
} from "../api/dates";

function refreshDecision(queryClient: QueryClient, tripId: string, decisionId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: datesKeys.decisions(tripId) }),
    queryClient.invalidateQueries({ queryKey: datesKeys.availability(decisionId) }),
  ]);
}

export function useOpenDecision(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DecisionCreate) => openDecision(tripId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: datesKeys.decisions(tripId) }),
  });
}

export function useUpdateDecision(tripId: string, decisionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DecisionPatch) => updateDecision(decisionId, body),
    onSuccess: () => refreshDecision(queryClient, tripId, decisionId),
  });
}

/** Sends a batch of my answers; the caller owns the optimistic state and the cache write. */
export function useSetAvailability(decisionId: string) {
  return useMutation({
    mutationFn: (answers: AvailabilityAnswer[]) => setAvailability(decisionId, answers),
  });
}

/** Closing writes the trip dates in the api, so the trip (shell, overview) is refreshed too. */
export function useCloseDecision(tripId: string, decisionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CloseDecisionBody) => closeDecision(decisionId, body),
    onSuccess: () =>
      Promise.all([
        refreshDecision(queryClient, tripId, decisionId),
        queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) }),
      ]),
  });
}

/** Reopening leaves the trip dates untouched. */
export function useReopenDecision(tripId: string, decisionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reopenDecision(decisionId),
    onSuccess: () => refreshDecision(queryClient, tripId, decisionId),
  });
}
