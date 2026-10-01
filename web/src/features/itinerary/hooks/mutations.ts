"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addNote,
  createEntry,
  deleteEntry,
  deleteNote,
  itineraryKeys,
  moveEntry,
  saveDay,
  updateEntry,
  updateNote,
  type DayInput,
  type EntryCreate,
  type EntryPatch,
  type Itinerary,
  type NoteCreate,
  type NotePatch,
} from "../api/itinerary";
import { optimisticMove } from "../lib/entries";
function useInvalidation(tripId: string) {
  const cache = useQueryClient();
  return () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: itineraryKeys.detail(tripId) }),
      cache.invalidateQueries({ queryKey: itineraryKeys.today(tripId) }),
    ]);
}
export function useCreateEntry(tripId: string) {
  return useMutation({
    mutationFn: (body: EntryCreate) => createEntry(tripId, body),
    onSuccess: useInvalidation(tripId),
  });
}
export function useUpdateEntry(tripId: string) {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EntryPatch }) =>
      updateEntry(id, body),
    onSuccess: useInvalidation(tripId),
  });
}
export function useDeleteEntry(tripId: string) {
  return useMutation({
    mutationFn: deleteEntry,
    onSuccess: useInvalidation(tripId),
  });
}
export function useSaveDay(tripId: string) {
  return useMutation({
    mutationFn: ({ date, body }: { date: string; body: DayInput }) =>
      saveDay(tripId, date, body),
    onSuccess: useInvalidation(tripId),
  });
}
export function useAddNote(tripId: string) {
  return useMutation({
    mutationFn: (body: NoteCreate) => addNote(tripId, body),
    onSuccess: useInvalidation(tripId),
  });
}
export function useUpdateNote(tripId: string) {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: NotePatch }) =>
      updateNote(id, body),
    onSuccess: useInvalidation(tripId),
  });
}
export function useDeleteNote(tripId: string) {
  return useMutation({
    mutationFn: deleteNote,
    onSuccess: useInvalidation(tripId),
  });
}
export function useMoveEntry(tripId: string) {
  const cache = useQueryClient();
  const invalidate = useInvalidation(tripId);
  const key = itineraryKeys.detail(tripId);
  return useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: "up" | "down" }) =>
      moveEntry(id, direction),
    onMutate: async ({ id, direction }) => {
      await cache.cancelQueries({ queryKey: key });
      const previous = cache.getQueryData<Itinerary>(key);
      if (previous)
        cache.setQueryData<Itinerary>(key, {
          ...previous,
          days: previous.days.map((day) => ({
            ...day,
            entries: optimisticMove(day.entries, id, direction),
          })),
          tray: optimisticMove(previous.tray, id, direction),
          out_of_range: optimisticMove(previous.out_of_range, id, direction),
        });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) cache.setQueryData(key, context.previous);
    },
    onSettled: invalidate,
  });
}
