import type { ReactNode } from "react";
import { Skeleton } from "@/ui/atoms/Skeleton";

export type BoardingPassCountdown = {
  /** The big figure: a number, or a word such as "Hoy". */
  value: string;
  unit?: string;
  /** The figure as a number, when it is one: the home hero counts up to it, other screens ignore it. */
  count?: number;
  caption: string;
  /** Optional call to action under the caption, e.g. "set the dates". */
  action?: ReactNode;
};

type BoardingPassProps = {
  /** Cover photo or illustration; fills the media frame. */
  media: ReactNode;
  /** Control floating over the media corner, e.g. the cover picker. */
  mediaAction?: ReactNode;
  /** `null` while the client clock is unknown: a fixed-size skeleton keeps layout and hydration stable. */
  countdown: BoardingPassCountdown | null;
  facts: { label: string; value: string }[];
};

/**
 * The trip hero, built like a boarding pass: a framed picture, then a raised pass whose countdown
 * is the one thing you read first. A dashed route with a ringed destination dot is the perforation.
 */
export function BoardingPass({ media, mediaAction, countdown, facts }: BoardingPassProps) {
  return (
    <div className="trip-hero">
      <div className="trip-hero-media">
        {media}
        {mediaAction && <div className="trip-hero-media-action">{mediaAction}</div>}
      </div>
      <div className="trip-pass">
        {countdown ? (
          <div className="trip-pass-countdown">
            <p className="trip-pass-figure">
              <span key={countdown.value} className="trip-pass-value ui-tabular ui-flip">
                {countdown.value}
              </span>
              {countdown.unit && <span className="trip-pass-unit">{countdown.unit}</span>}
            </p>
            <p className="trip-pass-caption">{countdown.caption}</p>
            {countdown.action}
          </div>
        ) : (
          <div className="trip-pass-countdown" aria-busy="true">
            <Skeleton className="trip-pass-skeleton-value" />
            <Skeleton className="trip-pass-skeleton-caption" />
          </div>
        )}
        <div className="trip-pass-route" aria-hidden="true">
          <i className="trip-pass-route-start" />
          <i className="trip-pass-route-line" />
          <i className="trip-pass-route-end" />
        </div>
        <dl className="trip-pass-facts">
          {facts.map(({ label, value }) => (
            <div key={label} className="trip-pass-fact">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
