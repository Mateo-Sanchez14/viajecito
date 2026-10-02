import { requireMe } from "@/features/auth/server/requireMe";
import { ProposalsMap } from "@/features/map/containers/ProposalsMap";
export default async function MapPage({ params }: { params: Promise<{ crewId: string; tripId: string }> }) {
  await requireMe();
  const { crewId, tripId } = await params;
  return <ProposalsMap tripId={tripId} crewId={crewId} />;
}
