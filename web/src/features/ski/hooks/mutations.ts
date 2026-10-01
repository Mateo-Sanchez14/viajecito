import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addTripResort,
  createManualReport,
  putSkiProfile,
  removeTripResort,
  setMyGear,
  setMyPass,
  skiKeys,
  type GearItemIn,
  type ManualReportIn,
  type PassIn,
  type PersonRef,
  type SkiProfileIn,
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

/** Saves my ski profile and keeps the cached copy in step with the saved one. */
export function useSaveSkiProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: SkiProfileIn) => putSkiProfile(profile),
    onSuccess: (saved) => {
      queryClient.setQueryData(skiKeys.profile(), saved);
      // Consent and sizes show up in every trip's rental roll-up.
      return queryClient.invalidateQueries({ queryKey: ["ski"] });
    },
  });
}

/** Adds a resort to the trip; the overview (resorts, conditions) is refetched. */
export function useAddTripResort(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resortId: string) => addTripResort(tripId, resortId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: skiKeys.overview(tripId) }),
  });
}

/** Removes a resort from the trip (its reports are kept by the api). */
export function useRemoveTripResort(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resortId: string) => removeTripResort(tripId, resortId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: skiKeys.overview(tripId) }),
  });
}

/** Posts a manual snow report for one resort of the trip. */
export function useManualReport(tripId: string, resortId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (report: ManualReportIn) => createManualReport(tripId, resortId, report),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: skiKeys.overview(tripId) }),
  });
}
