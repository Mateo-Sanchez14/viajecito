import { notFound } from "next/navigation";
import { requireMe } from "@/features/auth/server/requireMe";
import { loadTrip } from "@/features/trips/server/loadTrip";
import { BudgetView } from "@/features/budget/containers/BudgetView";
export default async function Page({
  params,
}: {
  params: Promise<{ crewId: string; tripId: string }>;
}) {
  await requireMe();
  const { crewId, tripId } = await params;
  const trip = await loadTrip(tripId);
  if (!trip || trip.crew_id !== crewId || !trip.modules.includes("budget"))
    notFound();
  return <BudgetView tripId={tripId} crewId={crewId} />;
}
