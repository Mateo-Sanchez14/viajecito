import { requireMe } from "@/features/auth/server/requireMe";
import { TodayView } from "@/features/today/containers/TodayView";
export default async function Page({
  params,
}: {
  params: Promise<{ crewId: string; tripId: string }>;
}) {
  await requireMe();
  const { tripId, crewId } = await params;
  return <TodayView tripId={tripId} crewId={crewId} />;
}
