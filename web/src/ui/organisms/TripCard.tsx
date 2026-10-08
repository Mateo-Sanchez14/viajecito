import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Badge, type BadgeVariant } from "@/ui/atoms/Badge";
import { CalendarBlankIcon } from "@/ui/icons";
import { AvatarStack } from "@/ui/molecules/AvatarStack";

export type TripCardPill = {
  /** What the pill says ("en 12 días"). May hold an animated number; never decorative. */
  content: ReactNode;
  /** `live` (in progress or leaving today) is the accent; the rest are quiet. */
  tone: "quiet" | "live";
};

type TripCardProps = {
  href: string;
  name: string;
  /** Where the trip goes, when it says. */
  destination?: string;
  dates: string;
  /** Picture frame content: a cover photo, a poster or an illustration (decorative). */
  media: ReactNode;
  pill?: TripCardPill;
  status?: { label: string; variant: BadgeVariant };
  people?: { names: readonly string[]; total: number; label: string };
  /** `compact` is the muted one-row card for past trips. */
  variant?: "card" | "compact";
  /** Position in the page's entrance sequence; drives the stagger through `--i`. */
  index?: number;
};

/**
 * A trip as a card: the picture on top, a caption on an opaque panel below (text never sits on an
 * image) and a pill with where the trip stands in time. The whole card is the link.
 */
export function TripCard({
  href,
  name,
  destination,
  dates,
  media,
  pill,
  status,
  people,
  variant = "card",
  index = 0,
}: TripCardProps) {
  const pillNode = pill && (
    <span className="trip-card-pill" data-tone={pill.tone}>
      {pill.content}
    </span>
  );
  return (
    <Link
      href={href}
      className="trip-card"
      data-variant={variant}
      style={{ "--i": index } as CSSProperties}
    >
      <span className="trip-card-media" aria-hidden="true">
        {media}
      </span>
      {variant === "card" && pillNode}
      <span className="trip-card-body">
        {variant === "compact" && pillNode}
        <span className="trip-card-title">{name}</span>
        <span className="trip-card-meta">
          {destination && <span className="trip-card-destination">{destination}</span>}
          <span className="trip-card-dates">
            <CalendarBlankIcon size={16} aria-hidden="true" />
            {dates}
          </span>
        </span>
        {(people || status) && variant === "card" && (
          <span className="trip-card-foot">
            {people && <AvatarStack names={people.names} total={people.total} label={people.label} />}
            {status && <Badge variant={status.variant}>{status.label}</Badge>}
          </span>
        )}
      </span>
    </Link>
  );
}
