import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireMe } from "@/features/auth/server/requireMe";
import { loadTrip } from "@/features/trips/server/loadTrip";
import { TripShellContainer } from "@/features/trips/containers/TripShellContainer";
import { TripProvider } from "@/features/trips/TripProvider";

type TripLayoutProps = {
  children: ReactNode;
  params: Promise<{ crewId: string; tripId: string }>;
};

/**
 * Shared frame of every trip page. Gate order: session (`requireMe`, redirects to /login) then
 * the trip (404 for a missing trip, a non-member, or a crew that does not match the URL).
 */
export default async function TripLayout({ children, params }: TripLayoutProps) {
  await requireMe();
  const { crewId, tripId } = await params;
  const trip = await loadTrip(tripId);
  if (!trip || trip.crew_id !== crewId) notFound();

  return (
    <TripProvider trip={trip}>
      <TripShellContainer>{children}</TripShellContainer>
    </TripProvider>
  );
}
