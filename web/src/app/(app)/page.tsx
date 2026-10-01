import { CrewTrips } from "@/features/trips/containers/CrewTrips";
import { HealthStatus } from "@/features/ops/containers/HealthStatus";

export default function Home() {
  return (
    <>
      <CrewTrips />
      <HealthStatus />
    </>
  );
}
