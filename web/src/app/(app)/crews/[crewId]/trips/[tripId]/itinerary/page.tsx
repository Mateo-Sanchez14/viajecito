import { requireMe } from "@/features/auth/server/requireMe";
import { ItineraryPlanner } from "@/features/itinerary/containers/ItineraryPlanner";
export default async function Page({
  params,
}: {
  params: Promise<{ crewId: string; tripId: string }>;
}) {
  await requireMe();
  const { tripId } = await params;
  return <ItineraryPlanner tripId={tripId} />;
}
