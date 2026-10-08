import Link from "next/link";
import type { ReactNode } from "react";
import { CaretLeftIcon } from "@/ui/icons";
import { PageHeader } from "@/ui/molecules/PageHeader";
import { SectionNav, type SectionNavItem } from "@/ui/molecules/SectionNav";

type TripShellProps = {
  title: string;
  subtitle?: string;
  /** A quiet way up, above the title. A plain link on purpose: a second navigation landmark would be noise. */
  backLink?: { href: string; label: string };
  navLabel: string;
  navItems: SectionNavItem[];
  /** Phone navigation. When given, the wide section nav only shows from md up. */
  mobileNav?: ReactNode;
  /** `data-tour` value for the wide section nav (the phone nav takes its own through `mobileNav`). */
  navTourAnchor?: string;
  children: ReactNode;
};

/** Presentational frame of every trip page: header, section navigation, then the page. */
export function TripShell({ title, subtitle, backLink, navLabel, navItems, mobileNav, navTourAnchor, children }: TripShellProps) {
  const sectionNav = <SectionNav label={navLabel} items={navItems} tourAnchor={navTourAnchor} />;
  return (
    <div className="trip-shell flex min-w-0 flex-col gap-7">
      {backLink && (
        <Link href={backLink.href} className="trip-back-link">
          <CaretLeftIcon size={18} aria-hidden="true" />
          <span>{backLink.label}</span>
        </Link>
      )}
      <PageHeader title={title} subtitle={subtitle} />
      {mobileNav ? <div className="trip-nav-wide">{sectionNav}</div> : sectionNav}
      {mobileNav}
      {children}
    </div>
  );
}
