"use client";

import { useTranslations } from "next-intl";
import type { Rsvp } from "../api/trips";
import { useSetRsvp } from "../hooks/mutations";
import { useTripContext } from "../TripProvider";

const OPTIONS = ["in", "maybe", "out"] as const satisfies readonly Rsvp[];

/** Container: segmented in / maybe / out control for the signed-in person's own RSVP. */
export function RsvpControl() {
  const t = useTranslations("trips.rsvp");
  const { trip, myRsvp, me } = useTripContext();
  const setRsvp = useSetRsvp(trip.id, me.person.id);

  return (
    <div className="flex flex-col gap-2">
      <p id={`rsvp-label-${trip.id}`} className="text-sm font-medium">{t("label")}</p>
      <div role="group" aria-labelledby={`rsvp-label-${trip.id}`} className="rsvp-control inline-flex w-full rounded-2xl border border-border p-1">
        {OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={myRsvp === option}
            disabled={setRsvp.isPending}
            onClick={() => setRsvp.mutate(option)}
            className={`min-h-11 flex-1 rounded-xl px-3 py-2 disabled:opacity-60 text-sm font-medium ${
              myRsvp === option ? "bg-foreground text-background" : "bg-surface text-foreground"
            }`}
          >
            {t(option)}
          </button>
        ))}
      </div>
      {setRsvp.isError && <p role="alert" className="text-sm text-warn">{t("failed")}</p>}
    </div>
  );
}
