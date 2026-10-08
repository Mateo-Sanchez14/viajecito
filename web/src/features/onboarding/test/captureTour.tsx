import { useEffect } from "react";
import { useTour, type TourApi } from "../TourProvider";

const latest = { current: undefined as unknown as TourApi };

/** Always reads the newest tour api the mounted `<CaptureTour />` saw (reading it never re-renders anything). */
export const tour: TourApi = new Proxy({} as TourApi, {
  get: (_target, key) => latest.current[key as keyof TourApi],
});

/** Mount inside a `TourProvider` to observe and drive it from a test. */
export function CaptureTour() {
  const api = useTour();
  useEffect(() => {
    latest.current = api;
  });
  return null;
}
