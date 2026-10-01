import "server-only";
import { createServerClient } from "@/shared/api/client.server";
import type { Proposal } from "./proposals";

/**
 * Server-side proposal fetch for the detail page. A 404 (missing, or a proposal of a trip the
 * viewer is not in: the api never reveals which) returns null; every other failure throws.
 */
export async function getProposalServer(cookieHeader: string, proposalId: string): Promise<Proposal | null> {
  const { data, response } = await createServerClient(cookieHeader).GET("/api/proposals/{proposal_id}", {
    params: { path: { proposal_id: proposalId } },
  });

  if (response.status === 404) return null;
  if (!data) throw new Error(`Could not load the proposal (HTTP ${response.status})`);
  return data;
}
