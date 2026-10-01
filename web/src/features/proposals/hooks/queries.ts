import { useQuery } from "@tanstack/react-query";
import {
  getProposal,
  getProposalsSummary,
  listComments,
  listProposals,
  proposalKeys,
  type Proposal,
  type ProposalFilters,
} from "../api/proposals";

const MINUTE = 60_000;
const HALF_MINUTE = 30_000;

/** Freshness is polling, not push: lists every 60 s, the open proposal and its thread every 30 s. */
export function useProposals(tripId: string, filters: ProposalFilters) {
  return useQuery({
    queryKey: proposalKeys.list(tripId, filters),
    queryFn: () => listProposals(tripId, filters),
    refetchInterval: MINUTE,
  });
}

export function useProposalsSummary(tripId: string) {
  return useQuery({
    queryKey: proposalKeys.summary(tripId),
    queryFn: () => getProposalsSummary(tripId),
    refetchInterval: MINUTE,
  });
}

/** One proposal; pass `initialData` when a server component already fetched it. */
export function useProposal(id: string, initialData?: Proposal) {
  return useQuery({
    queryKey: proposalKeys.detail(id),
    queryFn: () => getProposal(id),
    initialData,
    refetchInterval: HALF_MINUTE,
  });
}

export function useComments(id: string) {
  return useQuery({
    queryKey: proposalKeys.comments(id),
    queryFn: () => listComments(id),
    refetchInterval: HALF_MINUTE,
  });
}
