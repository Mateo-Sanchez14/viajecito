import type { ReactNode } from "react";

type TripSectionProps = {
  title: string;
  /** Heading level: sections sit one level under their crew heading, or under "Mis viajes" for a lone crew. */
  level: 3 | 4;
  /** `rail` scrolls and snaps on phones and becomes a grid from 768px; `list` is the compact stack. */
  layout: "rail" | "list";
  /** The `<li>` items (one per card). */
  children: ReactNode;
  /** Quieter heading for the past. */
  muted?: boolean;
};

/** A titled group of trip cards. */
export function TripSection({ title, level, layout, children, muted = false }: TripSectionProps) {
  const Heading = level === 3 ? "h3" : "h4";
  return (
    <section className="trip-section-group" data-muted={muted || undefined}>
      <Heading className="trip-section-title">{title}</Heading>
      <ul className={layout === "rail" ? "trip-rail" : "trip-compact-list"}>{children}</ul>
    </section>
  );
}
