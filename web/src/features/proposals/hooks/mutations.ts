import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useMe } from "@/features/auth/MeProvider";
import {
  addComment,
  castVote,
  createProposal,
  deleteComment,
  proposalKeys,
  refreshPreview,
  removeVote,
  transitionProposal,
  updateProposal,
  type Proposal,
  type ProposalCreate,
  type ProposalPatch,
  type ProposalsSummary,
  type ProposalSummary,
  type TransitionBody,
  type VoteValue,
} from "../api/proposals";
import { proposalWithVote, summaryWithVote } from "../lib/tally";

/** Every proposals query: lists, summary, details and threads (invalidating the root covers all). */
const invalidateAll = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: proposalKeys.root });

export function useCreateProposal(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProposalCreate) => createProposal(tripId, body),
    onSuccess: (proposal) => {
      queryClient.setQueryData(proposalKeys.detail(proposal.id), proposal);
      return invalidateAll(queryClient);
    },
  });
}

export function useUpdateProposal(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProposalPatch) => updateProposal(id, body),
    onSuccess: (proposal) => {
      queryClient.setQueryData(proposalKeys.detail(id), proposal);
      return invalidateAll(queryClient);
    },
  });
}

export function useTransition(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TransitionBody) => transitionProposal(id, body),
    onSuccess: (proposal) => {
      queryClient.setQueryData(proposalKeys.detail(id), proposal);
      return invalidateAll(queryClient);
    },
  });
}

type Snapshot = [QueryKey, unknown][];

/**
 * Casts, changes or removes (`null`) my vote. The tally flips at once in the detail, every cached
 * list and the overview summary; an api failure restores exactly what was cached before.
 */
export function useVote(id: string) {
  const queryClient = useQueryClient();
  const { person } = useMe();
  const me = { person_id: person.id, display_name: person.display_name };

  return useMutation({
    mutationFn: (next: VoteValue | null) => (next === null ? removeVote(id) : castVote(id, next)),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: proposalKeys.root });
      const snapshot: Snapshot = queryClient.getQueriesData({ queryKey: proposalKeys.root });

      queryClient.setQueryData<Proposal>(proposalKeys.detail(id), (old) =>
        old ? proposalWithVote(old, next, me) : old,
      );
      const bump = (item: ProposalSummary) => (item.id === id ? summaryWithVote(item, next) : item);
      queryClient.setQueriesData<ProposalSummary[]>(
        { queryKey: proposalKeys.root, predicate: (query) => query.queryKey[2] === "list" },
        (old) => old?.map(bump),
      );
      queryClient.setQueriesData<ProposalsSummary>(
        { queryKey: proposalKeys.root, predicate: (query) => query.queryKey[2] === "summary" },
        (old) => (old ? { ...old, top: old.top.map(bump) } : old),
      );
      return { snapshot };
    },
    onError: (_error, _next, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    // Not awaited: the vote is done (or rolled back) as soon as the api answers; the refetch
    // only reconciles in the background.
    onSettled: () => {
      void invalidateAll(queryClient);
    },
  });
}

export function useAddComment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addComment(id, body),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useRefreshPreview(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => refreshPreview(id),
    onSuccess: () => invalidateAll(queryClient),
  });
}
