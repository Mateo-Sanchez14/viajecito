import type { Entry } from "@/features/itinerary/api/itinerary";
import { MeetingPointCard } from "../components/MeetingPointCard";
export function NextMeetingPoint({ entry }: { entry: Entry | null }) {
  return entry ? <MeetingPointCard entry={entry} /> : null;
}
