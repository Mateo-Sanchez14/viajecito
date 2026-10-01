"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeVariant } from "@/ui/atoms/Badge";
import type { ProposalStatus } from "../api/proposals";

const VARIANT: Record<ProposalStatus, BadgeVariant> = {
  proposed: "neutral",
  discussing: "degraded",
  chosen: "ok",
  booked: "ok",
  discarded: "neutral",
};

/** Status as text (never colour alone). */
export function StatusBadge({ status }: { status: ProposalStatus }) {
  const t = useTranslations("proposals.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
