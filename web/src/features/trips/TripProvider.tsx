"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Participant, Rsvp, Trip } from "./api/trips";
import { useTrip } from "./hooks/useTrip";

type TripContextValue = {
  trip: Trip;
  modules: string[];
  participants: Participant[];
  myRsvp: Rsvp;
  refetch: () => Promise<void>;
};

const TripContext = createContext<TripContextValue | null>(null);

/**
 * Hands the server-fetched trip to everything under the trip shell. The trip stays live in the
 * TanStack cache (`["trips", id]`), so mutations anywhere under it update every consumer.
 */
export function TripProvider({ trip: initialTrip, children }: { trip: Trip; children: ReactNode }) {
  const { data, refetch } = useTrip(initialTrip.id, initialTrip);
  const trip = data ?? initialTrip;

  const value = useMemo<TripContextValue>(
    () => ({
      trip,
      modules: trip.modules,
      participants: trip.participants,
      myRsvp: trip.my_rsvp,
      refetch: async () => {
        await refetch();
      },
    }),
    [trip, refetch],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTripContext(): TripContextValue {
  const value = useContext(TripContext);
  if (!value) throw new Error("useTripContext must be used inside <TripProvider>");
  return value;
}
