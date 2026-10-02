import { useQuery } from "@tanstack/react-query";
import { documentKeys, listDocuments } from "../api/documents";
export function useDocuments(tripId: string, kind?: string) {
  return useQuery({
    queryKey: documentKeys.list(tripId, kind),
    queryFn: () => listDocuments(tripId, kind),
    refetchInterval: 60_000,
  });
}
