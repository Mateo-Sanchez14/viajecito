"use client";

import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties } from "react";
import { Button } from "@/ui/atoms/Button";
import { SPOT_PAD, placeCard, type Rect } from "../lib/placement";

type TourOverlayProps = {
  open: boolean;
  /** Where the highlighted element is (viewport pixels); null centers the card and shows no ring. */
  rect: Rect | null;
  /** Changes with every step: re-runs the content entrance and re-measures the card. */
  stepKey: string;
  progress: string;
  title: string;
  body: string;
  labels: { skip: string; back: string; next: string; done: string };
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

function spotVars(rect: Rect | null): CSSProperties | undefined {
  if (!rect) return undefined;
  return {
    "--spot-x": `${rect.x - SPOT_PAD}px`,
    "--spot-y": `${rect.y - SPOT_PAD}px`,
    "--spot-w": `${rect.width + SPOT_PAD * 2}px`,
    "--spot-h": `${rect.height + SPOT_PAD * 2}px`,
  } as CSSProperties;
}

/**
 * Presentational coach mark: one native modal <dialog> that is a transparent full-screen canvas
 * holding the spotlight ring (it also paints the dim, as an oversized shadow) and the card. The
 * browser makes the page inert, traps focus and turns Escape into `cancel`, which is a skip. A click
 * on the dim does nothing on purpose: dismissing for good by accident is worse than one more tap.
 */
export function TourOverlay({
  open,
  rect,
  stepKey,
  progress,
  title,
  body,
  labels,
  isFirst,
  isLast,
  onNext,
  onBack,
  onSkip,
}: TourOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // Before paint, so the card is never seen at its default corner. Focus goes to the primary control.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      primaryRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // The card is placed by writing its two variables: no state, so a step change costs one layout read.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !open) return;
    const place = () => {
      const { x, y, side } = placeCard(
        rect,
        { width: window.innerWidth, height: window.innerHeight },
        { width: card.offsetWidth, height: card.offsetHeight },
      );
      card.style.setProperty("--card-x", `${x}px`);
      card.style.setProperty("--card-y", `${y}px`);
      card.dataset.side = side;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, rect, stepKey]);

  // The first position is taken, not travelled to: movement between steps is what gets animated.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !open) return;
    const frame = requestAnimationFrame(() => card.setAttribute("data-ready", ""));
    return () => {
      cancelAnimationFrame(frame);
      card.removeAttribute("data-ready");
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="tour"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        onSkip();
      }}
      onClose={() => {
        // The browser closed it on its own: that is a dismissal too.
        if (open) onSkip();
      }}
    >
      <div className="tour-spotlight" aria-hidden="true" data-empty={rect ? undefined : ""} style={spotVars(rect)} />
      <div ref={cardRef} className="tour-card">
        <div key={stepKey} className="tour-step" aria-live="polite">
          <p className="tour-progress">{progress}</p>
          <h2 id={titleId} className="tour-title">
            {title}
          </h2>
          <p id={bodyId} className="tour-body">
            {body}
          </p>
        </div>
        <div className="tour-actions">
          <Button variant="link" onClick={onSkip}>
            {labels.skip}
          </Button>
          <div className="tour-actions-main">
            {!isFirst && (
              <Button variant="secondary" size="sm" onClick={onBack}>
                {labels.back}
              </Button>
            )}
            <Button ref={primaryRef} size="sm" className="ui-button-auto" onClick={onNext}>
              {isLast ? labels.done : labels.next}
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
