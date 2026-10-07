import Link from "next/link";
import type { ReactNode } from "react";
import { ProgressBar } from "@/ui/atoms/ProgressBar";
import { Skeleton } from "@/ui/atoms/Skeleton";

type StatCardProps = {
  /** Decorative icon; the caller marks it `aria-hidden`. */
  icon: ReactNode;
  /** The headline number, already formatted. */
  value: string;
  label: string;
  detail?: string;
  progress?: { value: number; label: string };
  /** Makes the whole card one link. */
  href?: string;
  /** Same-shape placeholders while the numbers load. */
  loading?: boolean;
};

/** One readiness meter: icon chip, big tabular number, what it counts and a thin progress bar. */
export function StatCard({ icon, value, label, detail, progress, href, loading = false }: StatCardProps) {
  if (loading) {
    return (
      <div className="stat-card ui-card" aria-busy="true">
        <div className="stat-card-head">
          <Skeleton className="stat-card-icon-skeleton" />
          <Skeleton className="stat-card-value-skeleton" />
        </div>
        <div className="stat-card-text">
          <Skeleton className="stat-card-line" />
          <Skeleton className="stat-card-line stat-card-line-short" />
        </div>
        <Skeleton className="stat-card-progress-skeleton" />
      </div>
    );
  }

  const content = (
    <>
      <span className="stat-card-head">
        <span className="stat-card-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="stat-card-value ui-tabular">{value}</span>
      </span>
      <span className="stat-card-text">
        <span className="stat-card-label">{label}</span>
        {detail && <span className="stat-card-detail">{detail}</span>}
      </span>
      {progress && <ProgressBar value={progress.value} label={progress.label} />}
    </>
  );

  return href ? (
    <Link href={href} className="stat-card stat-card-link ui-card">
      {content}
    </Link>
  ) : (
    <div className="stat-card ui-card">{content}</div>
  );
}
