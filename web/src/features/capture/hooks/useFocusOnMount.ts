import { useEffect, useRef } from "react";

/** A ref for the first field of a step: it takes focus when the step appears. */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
