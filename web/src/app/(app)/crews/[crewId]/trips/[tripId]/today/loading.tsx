import { Skeleton } from "@/ui/atoms/Skeleton";
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
