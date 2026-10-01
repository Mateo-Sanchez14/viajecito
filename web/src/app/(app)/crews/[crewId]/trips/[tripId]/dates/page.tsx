import { notFound } from "next/navigation";
import { requireMe } from "@/features/auth/server/requireMe";
import { DatesPlanner } from "@/features/dates/containers/DatesPlanner";
import { loadTrip } from "@/features/trips/server/loadTrip";

/** Dates section: availability grid, best windows and the decision to close. */
export default async function DatesPage({
  params,
}: {
  params: Promise<{ crewId: string; tripId: string }>;
}) {
  await requireMe();
  const { tripId } = await params;
  const trip = await loadTrip(tripId);
  if (!trip || !trip.modules.includes("dates")) notFound();

  return <DatesPlanner tripId={tripId} />;
}
