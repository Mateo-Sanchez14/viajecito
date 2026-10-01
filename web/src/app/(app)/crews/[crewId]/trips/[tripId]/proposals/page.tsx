import { notFound } from "next/navigation";
import { requireMe } from "@/features/auth/server/requireMe";
import { ProposalBoard } from "@/features/proposals/containers/ProposalBoard";
import { loadTrip } from "@/features/trips/server/loadTrip";

/** Proposals section of a trip: filters, list, add form. */
export default async function ProposalsPage({
  params,
}: {
  params: Promise<{ crewId: string; tripId: string }>;
}) {
  await requireMe();
  const { crewId, tripId } = await params;
  const trip = await loadTrip(tripId);
  if (!trip || !trip.modules.includes("proposals")) notFound();

  return <ProposalBoard tripId={tripId} crewId={crewId} />;
}
