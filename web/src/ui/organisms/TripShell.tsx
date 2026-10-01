import type { ReactNode } from "react";
import { PageHeader } from "@/ui/molecules/PageHeader";
import { SectionNav, type SectionNavItem } from "@/ui/molecules/SectionNav";

type TripShellProps = {
  title: string;
  subtitle?: string;
  navLabel: string;
  navItems: SectionNavItem[];
  children: ReactNode;
};

/** Presentational frame of every trip page: header, section navigation, then the page. */
export function TripShell({ title, subtitle, navLabel, navItems, children }: TripShellProps) {
  return (
    <div className="trip-shell flex min-w-0 flex-col gap-7">
      <PageHeader title={title} subtitle={subtitle} />
      <SectionNav label={navLabel} items={navItems} />
      {children}
    </div>
  );
}
