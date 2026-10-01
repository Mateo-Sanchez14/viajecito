import { requireMe } from "@/features/auth/server/requireMe";
import { SkiDashboard } from "@/features/ski/containers/SkiDashboard";

/** Ski section of a trip. The layout already gates the trip; `requireMe` guards this segment too. */
export default async function SkiPage({
  params,
}: {
  params: Promise<{ crewId: string; tripId: string }>;
}) {
  await requireMe();
  const { tripId } = await params;

  return <SkiDashboard tripId={tripId} />;
}
