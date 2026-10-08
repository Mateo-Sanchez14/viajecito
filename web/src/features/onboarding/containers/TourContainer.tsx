"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/shared/lib/usePrefersReducedMotion";
import { TourOverlay } from "../components/TourOverlay";
import { useAnchorRect } from "../hooks/useAnchorRect";
import { useMarkTourSeen } from "../hooks/useMarkTourSeen";
import { nextAvailableIndex, resolveSteps } from "../lib/anchors";
import { TOUR_STEPS, type TourStep } from "../lib/steps";
import { TOUR_VERSION } from "../lib/version";
import { useTour } from "../TourProvider";

/** Container, mounted once in the (app) layout: each start is one session over the steps on screen right now. */
export function TourContainer() {
  const { running, runId } = useTour();
  return running ? <TourSession key={runId} /> : null;
}

/** The element to hand focus back to: the opener if it is still there, else the page's main landmark. */
function restoreFocus(opener: HTMLElement | null) {
  if (opener && opener !== document.body && opener.isConnected) {
    opener.focus();
    return;
  }
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return;
  main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: true });
}

function TourSession() {
  const t = useTranslations("onboarding");
  const { stop } = useTour();
  const { mutate: markSeen } = useMarkTourSeen();
  const reduced = usePrefersReducedMotion();

  // Resolved once, at the start: "Paso n de N" stays put while the tour runs. Reading the DOM here is
  // the point (this component only exists after a click or a timer, never during server rendering).
  const [steps] = useState<TourStep[]>(() => resolveSteps(TOUR_STEPS));
  const [opener] = useState<HTMLElement | null>(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [index, setIndex] = useState(0);
  const direction = useRef<1 | -1>(1);
  const finished = useRef(false);

  const step = steps[index];
  const { element, rect, measured } = useAnchorRect(step?.anchor ?? null);

  // Skip, Escape, Finish and "nothing left to show" all end here, once: a double click is one request.
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    stop();
    markSeen(TOUR_VERSION);
  }, [stop, markSeen]);

  // Nothing on screen to point at: no dialog and nothing persisted (it is re-evaluated next time).
  useEffect(() => {
    if (steps.length === 0) stop();
  }, [steps.length, stop]);

  // The current anchor went away (the viewport crossed 768px, say): go on to the next one that exists.
  useEffect(() => {
    if (!measured || element || steps.length === 0) return;
    const next = nextAvailableIndex(steps, index, direction.current);
    if (next === null) finish();
    else setIndex(next);
  }, [measured, element, steps, index, finish]);

  // Bring the anchor into view before it is highlighted. A fixed element is always in view.
  useEffect(() => {
    if (!element || typeof element.scrollIntoView !== "function") return;
    if (getComputedStyle(element).position === "fixed") return;
    element.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [element, reduced]);

  // After the dialog is gone (so the page is no longer inert): focus back to where the person was.
  useEffect(
    () => () => {
      if (finished.current) restoreFocus(opener);
    },
    [opener],
  );

  if (!step) return null;
  const isLast = index === steps.length - 1;

  return (
    <TourOverlay
      open
      rect={rect}
      stepKey={step.id}
      progress={t("progress", { current: index + 1, total: steps.length })}
      title={t(`steps.${step.id}.title`)}
      body={t(`steps.${step.id}.body`)}
      labels={{ skip: t("skip"), back: t("back"), next: t("next"), done: t("done") }}
      isFirst={index === 0}
      isLast={isLast}
      onNext={() => {
        if (isLast) return finish();
        direction.current = 1;
        setIndex(index + 1);
      }}
      onBack={() => {
        direction.current = -1;
        setIndex(Math.max(0, index - 1));
      }}
      onSkip={finish}
    />
  );
}
