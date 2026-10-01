import { Skeleton } from "@/ui/atoms/Skeleton";

export default function ProposalsLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
  );
}
