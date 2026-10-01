import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTrip,
  patchTrip,
  setRsvp,
  tripKeys,
  type Rsvp,
  type Trip,
  type TripCreate,
  type TripPatch,
} from "../api/trips";

/** Creates a trip, seeds its cache entry and refreshes the crew's list. */
export function useCreateTrip(crewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TripCreate) => createTrip(crewId, body),
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKeys.detail(trip.id), trip);
      return queryClient.invalidateQueries({ queryKey: tripKeys.crew(crewId) });
    },
  });
}

export function usePatchTrip(tripId: string, crewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TripPatch) => patchTrip(tripId, body),
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKeys.detail(tripId), trip);
      return queryClient.invalidateQueries({ queryKey: tripKeys.crew(crewId) });
    },
  });
}

function withRsvp(trip: Trip, personId: string, rsvp: Rsvp): Trip {
  return {
    ...trip,
    my_rsvp: rsvp,
    participants: trip.participants.map((p) =>
      p.person_id === personId ? { ...p, rsvp } : p,
    ),
  };
}

/** Sets my RSVP optimistically: the cache flips at once and rolls back if the api refuses. */
export function useSetRsvp(tripId: string, personId: string) {
  const queryClient = useQueryClient();
  const key = tripKeys.detail(tripId);
  return useMutation({
    mutationFn: (rsvp: Rsvp) => setRsvp(tripId, rsvp),
    onMutate: async (rsvp) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Trip>(key);
      if (previous) queryClient.setQueryData(key, withRsvp(previous, personId, rsvp));
      return { previous };
    },
    onError: (_error, _rsvp, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
