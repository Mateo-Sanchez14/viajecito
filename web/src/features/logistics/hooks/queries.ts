import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTasks,
  getPacking,
  packingSummary,
  updateTask,
  updatePackingEntry,
  logisticsKeys,
  type Task,
  type TaskFilters,
  type TaskPatch,
  type Packing,
  type PackingPatch,
} from "../api/logistics";
export function useTasks(tripId: string, filters: TaskFilters = {}) {
  return useQuery({
    queryKey: logisticsKeys.tasks(tripId, filters),
    queryFn: () => listTasks(tripId, filters),
    refetchInterval: 60_000,
  });
}
export function usePacking(tripId: string) {
  return useQuery({
    queryKey: logisticsKeys.packing(tripId),
    queryFn: () => getPacking(tripId),
  });
}
export function usePackingSummary(tripId: string) {
  return useQuery({
    queryKey: logisticsKeys.summary(tripId),
    queryFn: () => packingSummary(tripId),
    refetchInterval: 60_000,
  });
}
export function useUpdateTask(tripId: string) {
  const cache = useQueryClient();
  const prefix = ["logistics", tripId, "tasks"];
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TaskPatch }) =>
      updateTask(id, body),
    onMutate: async ({ id, body }) => {
      await cache.cancelQueries({ queryKey: prefix });
      const old = cache.getQueriesData<Task[]>({ queryKey: prefix });
      cache.setQueriesData<Task[]>({ queryKey: prefix }, (data) =>
        data?.map((task) =>
          task.id === id ? { ...task, ...body, owner: task.owner } : task,
        ),
      );
      return old;
    },
    onError: (_e, _v, old) =>
      old?.forEach(([key, data]) => cache.setQueryData(key, data)),
    onSettled: () =>
      cache.invalidateQueries({ queryKey: ["logistics", tripId] }),
  });
}
export function useUpdatePackingEntry(tripId: string) {
  const cache = useQueryClient();
  const key = logisticsKeys.packing(tripId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PackingPatch }) =>
      updatePackingEntry(id, body),
    onMutate: async ({ id, body }) => {
      await cache.cancelQueries({ queryKey: key });
      const old = cache.getQueryData<Packing>(key);
      cache.setQueryData<Packing>(key, (data) => {
        if (!data) return data;
        const sections = data.sections.map((section) => ({
          ...section,
          entries: section.entries.map((entry) =>
            entry.id === id ? { ...entry, ...body } : entry,
          ),
        }));
        return {
          ...data,
          sections,
          progress: {
            total: data.progress.total,
            packed: sections
              .flatMap((section) => section.entries)
              .filter((entry) => entry.packed).length,
          },
        };
      });
      return old;
    },
    onError: (_e, _v, old) => cache.setQueryData(key, old),
    onSettled: () =>
      cache.invalidateQueries({ queryKey: ["logistics", tripId] }),
  });
}
