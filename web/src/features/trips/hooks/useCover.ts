import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteCover, uploadCover } from "../api/cover";
import { tripKeys, type Trip } from "../api/trips";
import { downscaleImage } from "../lib/downscaleImage";

function useCommit(tripId: string, crewId: string) {
  const queryClient = useQueryClient();
  return (trip: Trip) => {
    queryClient.setQueryData(tripKeys.detail(tripId), trip);
    return queryClient.invalidateQueries({ queryKey: tripKeys.crew(crewId) });
  };
}

/** Downscales the picked photo and uploads it; the trip cache then carries the new cover version. */
export function useSetCover(tripId: string, crewId: string) {
  const commit = useCommit(tripId, crewId);
  return useMutation({
    mutationFn: async (file: File) => uploadCover(tripId, await downscaleImage(file)),
    onSuccess: commit,
  });
}

/** Removes the cover; the trip cache then reports `has_cover: false`. */
export function useClearCover(tripId: string, crewId: string) {
  const commit = useCommit(tripId, crewId);
  return useMutation({
    mutationFn: () => deleteCover(tripId),
    onSuccess: commit,
  });
}
