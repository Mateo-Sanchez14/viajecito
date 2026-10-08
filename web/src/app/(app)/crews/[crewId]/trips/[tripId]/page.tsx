import { TourAutoStart } from "@/features/onboarding/containers/TourAutoStart";
import { TripOverview } from "@/features/trips/containers/TripOverview";

export default function TripOverviewPage() {
  return (
    <>
      <TripOverview />
      {/* Only the overview may start the tour on its own. */}
      <TourAutoStart />
    </>
  );
}
