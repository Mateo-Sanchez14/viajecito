import { Skeleton } from "@/ui/atoms/Skeleton";

type ListSkeletonProps = {
  /** Include the tall block that stands for a summary card above the rows. */
  hero?: boolean;
  rows?: number;
};

/** Route loading shape shared by budget, documents and logistics: a hero block, then rows. */
export function ListSkeleton({ hero = true, rows = 3 }: ListSkeletonProps) {
  return (
    <div className="flex flex-col gap-3">
      {hero && <Skeleton className="loading-hero" data-skeleton="hero" />}
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="loading-row" data-skeleton="row" />
      ))}
    </div>
  );
}
