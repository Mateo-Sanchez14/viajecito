import { useQuery } from "@tanstack/react-query";
import { listTrips, tripKeys } from "../api/trips";

export function useTrips(crewId: string) {
  return useQuery({
    queryKey: tripKeys.crew(crewId),
    queryFn: () => listTrips(crewId),
  });
}
