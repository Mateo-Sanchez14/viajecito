import { HomeHero } from "@/features/trips/containers/HomeHero";
import { CrewTrips } from "@/features/trips/containers/CrewTrips";
import { HealthStatus } from "@/features/ops/containers/HealthStatus";

export default function Home() {
  return (
    <>
      <HomeHero />
      <CrewTrips />
      <div className="home-health"><HealthStatus /></div>
    </>
  );
}
