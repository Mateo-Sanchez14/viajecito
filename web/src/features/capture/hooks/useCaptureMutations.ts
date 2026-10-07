import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTask, type TaskCreate } from "@/features/logistics/api/logistics";
import { createProposal, proposalKeys, type ProposalCreate } from "@/features/proposals/api/proposals";

function requireTrip(tripId: string | null): string {
  // The forms keep submit disabled until a trip is chosen; this only guards against a bypass.
  if (!tripId) throw new Error("A capture needs a target trip");
  return tripId;
}

/**
 * Creates a proposal for a link or a priced idea. Same endpoint and cache as the proposals
 * board; the budget summary is refreshed too because a proposal without a price is a pending
 * item there. It never writes to the budget.
 */
export function useCaptureProposal(tripId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProposalCreate) => createProposal(requireTrip(tripId), body),
    onSuccess: async (proposal) => {
      queryClient.setQueryData(proposalKeys.detail(proposal.id), proposal);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: proposalKeys.root }),
        queryClient.invalidateQueries({ queryKey: ["budget", tripId] }),
      ]);
    },
  });
}

/** Creates a task; every logistics query (tasks, packing summary) refetches. */
export function useCreateTask(tripId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TaskCreate) => createTask(requireTrip(tripId), body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["logistics", tripId] }),
  });
}
