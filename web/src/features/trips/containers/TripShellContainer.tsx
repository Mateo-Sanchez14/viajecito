"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { BottomNav } from "@/ui/molecules/BottomNav";
import { DotsThreeIcon } from "@/ui/icons";
import { ViewTransition } from "@/ui/motion/ViewTransition";
import { TripShell } from "@/ui/organisms/TripShell";
import { moduleIcon } from "../lib/moduleIcons";
import { splitNav } from "../lib/navigation";
import { sectionPath, tripPath } from "../lib/paths";
import { useDateRange } from "../lib/useDateRange";
import { useSectionLabel } from "../lib/useSectionLabel";
import { useTripContext } from "../TripProvider";

const isWithin = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Container: wires the trip from context and the current path into the presentational shell. */
export function TripShellContainer({ children }: { children: ReactNode }) {
  const t = useTranslations("trips");
  const tUi = useTranslations("ui");
  const pathname = usePathname();
  const dateRange = useDateRange();
  const sectionLabel = useSectionLabel();
  const { trip, modules } = useTripContext();

  const overviewHref = tripPath(trip.crew_id, trip.id);
  const navItems = [
    {
      key: "overview",
      label: sectionLabel("overview"),
      href: overviewHref,
      active: pathname === overviewHref,
    },
    ...modules.map((key) => {
      const href = sectionPath(trip.crew_id, trip.id, key);
      return { key, label: sectionLabel(key), href, active: isWithin(pathname, href) };
    }),
  ].map((item) => ({
    ...item,
    icon: moduleIcon(item.key),
    activeIcon: moduleIcon(item.key, true),
  }));

  const { primary, more } = splitNav(navItems, trip.status);
  // The overview hero already shows the dates beside the countdown: say them once per screen.
  const onOverview = pathname === overviewHref;

  return (
    <TripShell
      title={trip.name}
      subtitle={onOverview ? undefined : dateRange(trip.start_on, trip.end_on)}
      navLabel={t("nav.label")}
      navItems={navItems}
      mobileNav={
        <BottomNav
          label={t("nav.mobileLabel")}
          items={primary}
          more={
            more.length > 0
              ? {
                  label: t("nav.more"),
                  title: t("nav.moreTitle"),
                  closeLabel: tUi("close"),
                  icon: <DotsThreeIcon size={22} aria-hidden="true" />,
                  items: more,
                }
              : undefined
          }
        />
      }
    >
      {/* Keyed by pathname: a section change is one exit + one enter; the chrome around it never remounts. */}
      <ViewTransition key={pathname} enter="section-enter" exit="section-exit" default="none">
        <div className="trip-section">{children}</div>
      </ViewTransition>
    </TripShell>
  );
}
