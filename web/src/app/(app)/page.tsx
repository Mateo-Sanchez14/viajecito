import { HealthStatus } from "@/features/ops/containers/HealthStatus";
import { MyCrews } from "@/features/auth/containers/MyCrews";

export default function Home() {
  return (
    <>
      <MyCrews />
      <HealthStatus />
    </>
  );
}
