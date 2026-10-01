import { Skeleton } from "@/ui/atoms/Skeleton";

export default function ProposalLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-32" />
      <Skeleton className="h-24" />
    </div>
  );
}
