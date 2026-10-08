"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type TourApi = {
  /** False without a provider: entry points (the "?" button) hide themselves. */
  available: boolean;
  running: boolean;
  /** Changes on every start, so a restarted tour is a new session even if `running` never dropped. */
  runId: number;
  start: () => void;
  stop: () => void;
  /** Ask for a start on whichever overview mounts next (replay from another page). */
  requestStart: () => void;
  isPending: () => boolean;
  /** True once the tour has started in this visit (for any reason): it never auto-starts twice. */
  wasAutoStarted: () => boolean;
};

const INERT: TourApi = {
  available: false,
  running: false,
  runId: 0,
  start() {},
  stop() {},
  requestStart() {},
  isPending: () => false,
  wasAutoStarted: () => true,
};

const TourContext = createContext<TourApi | null>(null);

/** Outside a provider the tour is inert: nothing starts and no entry point shows. */
export function useTour(): TourApi {
  return useContext(TourContext) ?? INERT;
}

/**
 * Lives in the (app) layout, so it survives client navigations: a replay requested on one page
 * is still pending when the overview of another mounts. The flags are refs on purpose (read by
 * effects and timers, never rendered), which also keeps strict-mode double effects harmless.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const pending = useRef(false);
  const autoStarted = useRef(false);

  const start = useCallback(() => {
    pending.current = false;
    autoStarted.current = true;
    setRunId((id) => id + 1);
    setRunning(true);
  }, []);
  const stop = useCallback(() => setRunning(false), []);
  const requestStart = useCallback(() => {
    pending.current = true;
  }, []);
  const isPending = useCallback(() => pending.current, []);
  const wasAutoStarted = useCallback(() => autoStarted.current, []);

  const value = useMemo<TourApi>(
    () => ({ available: true, running, runId, start, stop, requestStart, isPending, wasAutoStarted }),
    [running, runId, start, stop, requestStart, isPending, wasAutoStarted],
  );
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
