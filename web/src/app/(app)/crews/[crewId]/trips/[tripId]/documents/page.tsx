import { notFound } from "next/navigation";
import { requireMe } from "@/features/auth/server/requireMe";
import { loadTrip } from "@/features/trips/server/loadTrip";
import { DocumentVault } from "@/features/documents/containers/DocumentVault";
export default async function Page({
  params,
}: {
  params: Promise<{ crewId: string; tripId: string }>;
}) {
  const me = await requireMe();
  const { crewId, tripId } = await params;
  const trip = await loadTrip(tripId);
  if (!trip || trip.crew_id !== crewId || !trip.modules.includes("documents"))
    notFound();
  return <DocumentVault tripId={tripId} viewerId={me.person.id} />;
}
