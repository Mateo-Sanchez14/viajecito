import type { ReactNode } from "react";
import { ButtonLink } from "@/ui/atoms/ButtonLink";
import { CountUp } from "@/ui/atoms/CountUp";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { CaretRightIcon } from "@/ui/icons";
import { InlineError } from "@/ui/molecules/InlineError";
import type { BoardingPassCountdown } from "./BoardingPass";

export type LandingNext =
  | { status: "loading"; label: string }
  | { status: "error"; message: string; retryLabel: string; onRetry: () => void }
  | { status: "empty"; title: string; body: string; /** The one way forward, e.g. "create a trip". */ action?: ReactNode }
  | {
      status: "trip";
      label: string;
      name: string;
      /** Where the trip goes, when it says. */
      destination?: string;
      dates?: string;
      href: string;
      cta: string;
      /** `null` while the client clock is unknown. */
      countdown: BoardingPassCountdown | null;
    };

type LandingHeroProps = {
  /** Cover photo, or the illustration with its ambient layer; fills the media frame. */
  media: ReactNode;
  greeting: string;
  tagline: string;
  next: LandingNext;
};

/**
 * The home landing: media on top, then a raised panel that greets and shows the next trip. Text
 * always sits on the opaque panel, never on the media, so its contrast never depends on a frame.
 */
export function LandingHero({ media, greeting, tagline, next }: LandingHeroProps) {
  return (
    <section className="landing-hero" aria-labelledby="landing-hero-greeting">
      <div className="landing-hero-media">{media}</div>
      <div className="landing-hero-panel">
        <h1 id="landing-hero-greeting" className="landing-hero-greeting">
          {greeting}
        </h1>
        <p className="landing-hero-tagline">{tagline}</p>
        {next.status === "loading" && (
          <div className="landing-next" role="status" aria-busy="true" aria-label={next.label}>
            <Skeleton className="landing-next-skeleton" />
          </div>
        )}
        {next.status === "error" && (
          <div className="landing-next">
            <InlineError message={next.message} retryLabel={next.retryLabel} onRetry={next.onRetry} />
          </div>
        )}
        {next.status === "empty" && (
          <div className="landing-next">
            <h2 className="landing-next-name">{next.title}</h2>
            <p className="landing-next-caption">{next.body}</p>
            {next.action}
          </div>
        )}
        {next.status === "trip" && (
          <div className="landing-next">
            <p className="landing-next-label">{next.label}</p>
            <h2 className="landing-next-name">{next.name}</h2>
            {(next.destination || next.dates) && (
              <p className="landing-next-meta">
                {next.destination && <span>{next.destination}</span>}
                {next.dates && <span>{next.dates}</span>}
              </p>
            )}
            {next.countdown ? (
              <>
                <p className="landing-next-figure">
                  <span key={next.countdown.value} className="landing-next-value ui-tabular ui-flip">
                    {next.countdown.count !== undefined ? <CountUp value={next.countdown.count} /> : next.countdown.value}
                  </span>
                  {next.countdown.unit && <span className="landing-next-unit">{next.countdown.unit}</span>}
                </p>
                <p className="landing-next-caption">{next.countdown.caption}</p>
              </>
            ) : (
              <Skeleton className="landing-next-skeleton" />
            )}
            <ButtonLink href={next.href} variant="primary" size="sm">
              {next.cta}
              <CaretRightIcon size={18} aria-hidden="true" />
            </ButtonLink>
          </div>
        )}
      </div>
    </section>
  );
}
