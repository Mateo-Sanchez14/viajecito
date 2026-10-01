import { requireMe } from "@/features/auth/server/requireMe";
import { SkiProfileForm } from "@/features/ski/containers/SkiProfileForm";

/** My ski profile: global across trips, linked from every ski trip page. */
export default async function SkiProfilePage() {
  await requireMe();

  return <SkiProfileForm />;
}
