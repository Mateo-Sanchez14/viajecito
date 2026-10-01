import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { requireMe } from "@/features/auth/server/requireMe";
import { getProposalServer } from "@/features/proposals/api/proposals.server";
import { ProposalDetail } from "@/features/proposals/containers/ProposalDetail";

/**
 * One proposal. Gate order: session, then the proposal (404 for a missing one, a non-member, or a
 * proposal that belongs to a different trip than the URL says).
 */
export default async function ProposalPage({
  params,
}: {
  params: Promise<{ crewId: string; tripId: string; proposalId: string }>;
}) {
  await requireMe();
  const { tripId, proposalId } = await params;
  const proposal = await getProposalServer((await cookies()).toString(), proposalId);
  if (!proposal || proposal.trip_id !== tripId) notFound();

  return <ProposalDetail proposalId={proposalId} initialProposal={proposal} />;
}
