"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/ui/atoms/Card";
import { useTripContext } from "@/features/trips/TripProvider";
import { useTasks } from "../hooks/queries";
export function LogisticsOverviewCard({
  tripId,
  crewId,
}: {
  tripId: string;
  crewId: string;
}) {
  const t = useTranslations("logistics");
  const { me } = useTripContext();
  const tasks = useTasks(tripId);
  const open = tasks.data?.filter((task) => task.status !== "done") ?? [];
  return (
    <Card as="section">
      <h3>
        <Link href={`/crews/${crewId}/trips/${tripId}/logistics`}>
          {t("title")}
        </Link>
      </h3>
      {tasks.isError && <p role="alert">{t("loadFailed")}</p>}
      {tasks.data && (
        <p>
          {t("overview", {
            overdue: open.filter((task) => task.overdue).length,
            mine: open.filter((task) => task.owner?.person_id === me.person.id)
              .length,
          })}
        </p>
      )}
    </Card>
  );
}
