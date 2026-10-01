"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { TripShell } from "@/ui/organisms/TripShell";
import { sectionPath, tripPath } from "../lib/paths";
import { useDateRange } from "../lib/useDateRange";
import { useSectionLabel } from "../lib/useSectionLabel";
import { useTripContext } from "../TripProvider";

const isWithin = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Container: wires the trip from context and the current path into the presentational shell. */
export function TripShellContainer({ children }: { children: ReactNode }) {
  const t = useTranslations("trips");
  const pathname = usePathname();
  const dateRange = useDateRange();
  const sectionLabel = useSectionLabel();
  const { trip, modules } = useTripContext();

  const overviewHref = tripPath(trip.crew_id, trip.id);
  const navItems = [
    { key: "overview", label: sectionLabel("overview"), href: overviewHref, active: pathname === overviewHref },
    ...modules.map((key) => {
      const href = sectionPath(trip.crew_id, trip.id, key);
      return { key, label: sectionLabel(key), href, active: isWithin(pathname, href) };
    }),
  ];

  return (
    <TripShell
      title={trip.name}
      subtitle={dateRange(trip.start_on, trip.end_on)}
      navLabel={t("nav.label")}
      navItems={navItems}
    >
      {children}
    </TripShell>
  );
}
