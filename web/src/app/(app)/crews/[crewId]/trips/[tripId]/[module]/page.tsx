import { notFound } from "next/navigation";
import { ComingSoon } from "@/features/trips/containers/ComingSoon";
import { loadTrip } from "@/features/trips/server/loadTrip";

/**
 * Fallback for trip modules that have no page yet. A milestone ships its own static
 * `<section>/page.tsx` next to this folder, and the static segment wins over `[module]`.
 * A segment that is not one of the trip's modules is a 404.
 */
export default async function ModulePlaceholderPage({
  params,
}: {
  params: Promise<{ tripId: string; module: string }>;
}) {
  const { tripId, module: moduleKey } = await params;
  const trip = await loadTrip(tripId);
  if (!trip || !trip.modules.includes(moduleKey)) notFound();

  return <ComingSoon moduleKey={moduleKey} />;
}
