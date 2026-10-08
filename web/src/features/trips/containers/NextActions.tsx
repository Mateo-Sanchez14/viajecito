"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { TOUR_ANCHOR } from "@/shared/lib/tourAnchors";
import { tripActions, type TripAction } from "../actions";
import { useTripContext } from "../TripProvider";

/**
 * Container: what is still missing, from the registry and gated by the trip's modules. Rules that
 * have nothing to say leave their `li` empty; when every one does, CSS hides the whole section.
 * A finished trip has nothing left to chase.
 */
export function NextActions({ actions = tripActions }: { actions?: TripAction[] }) {
  const t = useTranslations("trips.actions");
  const headingId = useId();
  const { trip, modules } = useTripContext();

  if (trip.status === "done") return null;
  const entries = actions
    .filter((action) => !action.module || modules.includes(action.module))
    .sort((a, b) => a.order - b.order);
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby={headingId} data-tour={TOUR_ANCHOR.nextActions} className="next-actions ui-enter">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("title")}
      </h2>
      <ul className="next-actions-list">
        {entries.map(({ key, Component }) => (
          <li key={key} className="empty:hidden">
            <Component tripId={trip.id} crewId={trip.crew_id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
