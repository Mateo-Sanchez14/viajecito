"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarBlankIcon,
  FileTextIcon,
  ListChecksIcon,
  MapTrifoldIcon,
  UsersThreeIcon,
  WalletIcon,
} from "@/ui/icons";
import { NextActionRow } from "@/ui/molecules/NextActionRow";
import { sectionPath } from "../lib/paths";
import type { ActionItem, ActionTarget } from "./types";

const ICONS: Record<ActionTarget, ReactNode> = {
  rsvp: <UsersThreeIcon size={20} aria-hidden="true" />,
  dates: <CalendarBlankIcon size={20} aria-hidden="true" />,
  budget: <WalletIcon size={20} aria-hidden="true" />,
  logistics: <ListChecksIcon size={20} aria-hidden="true" />,
  documents: <FileTextIcon size={20} aria-hidden="true" />,
  itinerary: <MapTrifoldIcon size={20} aria-hidden="true" />,
};

/** Turns a rule's decision into a row: copy from `trips.actions`, a link to the RSVP block or a section. */
export function ActionRow({ item, tripId, crewId }: { item: ActionItem; tripId: string; crewId: string }) {
  const t = useTranslations("trips.actions");
  const detailKey = `${item.messageKey}Detail`;
  return (
    <NextActionRow
      icon={ICONS[item.target]}
      tone={item.tone}
      title={t(item.messageKey, item.values)}
      detail={t.has(detailKey) ? t(detailKey, item.values) : undefined}
      href={item.target === "rsvp" ? "#rsvp" : sectionPath(crewId, tripId, item.target)}
    />
  );
}
