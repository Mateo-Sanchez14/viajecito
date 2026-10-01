import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  setMyGear,
  setMyPass,
  skiKeys,
  type GearItemIn,
  type PassIn,
  type PersonRef,
  type SkiOverview,
} from "../api/ski";
import { applyMyPass } from "../lib/passes";

/** Sets my lift pass optimistically: the overview flips at once and rolls back on failure. */
export function useSetMyPass(tripId: string, me: PersonRef) {
  const queryClient = useQueryClient();
  const key = skiKeys.overview(tripId);
  return useMutation({
    mutationFn: (pass: PassIn) => setMyPass(tripId, pass),
    onMutate: async (pass) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SkiOverview>(key);
      if (previous) queryClient.setQueryData(key, applyMyPass(previous, me, pass));
      return { previous };
    },
    onError: (_error, _pass, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Replaces my gear plan; the roll-up in the overview is refetched on success. */
export function useSetMyGear(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: GearItemIn[]) => setMyGear(tripId, items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: skiKeys.overview(tripId) }),
  });
}
