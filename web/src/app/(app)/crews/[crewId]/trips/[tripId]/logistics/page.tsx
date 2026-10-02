import { notFound } from "next/navigation";
import { requireMe } from "@/features/auth/server/requireMe";
import { loadTrip } from "@/features/trips/server/loadTrip";
import { LogisticsBoard } from "@/features/logistics/containers/LogisticsBoard";
export default async function Page({
  params,
}: {
  params: Promise<{ crewId: string; tripId: string }>;
}) {
  await requireMe();
  const { crewId, tripId } = await params;
  const trip = await loadTrip(tripId);
  if (!trip || trip.crew_id !== crewId || !trip.modules.includes("logistics"))
    notFound();
  return <LogisticsBoard tripId={tripId} />;
}
