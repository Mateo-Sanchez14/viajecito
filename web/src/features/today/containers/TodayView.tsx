"use client";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useTripContext } from "@/features/trips/TripProvider";
import { useToday } from "../hooks/useToday";
import { CountdownBadge } from "../components/CountdownBadge";
import { NextMeetingPoint } from "./NextMeetingPoint";
import { TodayTimeline } from "./TodayTimeline";
import { QuickNotes } from "./QuickNotes";
import { DocumentShortcuts } from "./DocumentShortcuts";
import { SnowStrip } from "./SnowStrip";
function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
export function TodayView({ tripId }: { tripId: string; crewId: string }) {
  const t = useTranslations("today");
  const { modules } = useTripContext();
  const { data, isPending, isError } = useToday(tripId);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const initialNotes = data
    ? [
        ...data.pinned_notes,
        ...data.recent_notes.filter(
          (note) => !data.pinned_notes.some((pinned) => pinned.id === note.id),
        ),
      ]
    : [];
  return (
    <div className="min-w-0 space-y-5">
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      {!online && (
        <p role="status" aria-live="polite">
          {t("offline")}
        </p>
      )}
      {isError && <p role="status">{t(data ? "refreshError" : "loadError")}</p>}
      {isPending && <p role="status">{t("loading")}</p>}
      {data && (
        <>
          <p className="break-words text-sm text-muted">
            {t("timezone", {
              date: data.local_date,
              time: data.local_time,
              timezone: data.timezone,
            })}
          </p>
          {data.mode === "before" && (
            <CountdownBadge days={data.countdown_days ?? 0} />
          )}
          {data.mode === "undated" && <p>{t("undated")}</p>}
          {data.mode === "after" && <p>{t("after")}</p>}
          {(data.mode === "during" || data.mode === "before") && (
            <>
              <NextMeetingPoint entry={data.next_meeting_point} />
              <TodayTimeline today={data} />
            </>
          )}
          {modules.includes("documents") && (
            <DocumentShortcuts tripId={tripId} />
          )}
          {modules.includes("ski") && <SnowStrip tripId={tripId} />}
          <QuickNotes tripId={tripId} initialNotes={initialNotes} />
        </>
      )}
    </div>
  );
}
