import { useTranslations } from "next-intl";
import { Badge, type BadgeVariant } from "@/ui/atoms/Badge";
import type { PassStatus } from "../api/ski";

const VARIANT: Record<PassStatus, BadgeVariant> = {
  needed: "degraded",
  bought: "ok",
  season_pass: "ok",
  not_needed: "neutral",
};

/** Presentational: a lift pass status as a colored text badge. */
export function PassStatusBadge({ status }: { status: PassStatus }) {
  const t = useTranslations("ski.passes.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
