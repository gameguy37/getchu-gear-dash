import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid lg:grid-cols-5 gap-6">
        <Skeleton className="lg:col-span-3 h-96 rounded-lg" />
        <Skeleton className="lg:col-span-2 h-96 rounded-lg" />
      </div>
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="min-w-[240px] w-[240px]">
            <Skeleton className="h-6 w-24 mb-3" />
            <div className="space-y-2">
              {[1, 2].map((j) => (
                <Skeleton key={j} className="h-28 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-2">
        <Skeleton className="h-12 w-full rounded-lg" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function OperatorSkeleton() {
  return (
    <div className="min-h-full bg-operator-bg p-4 md:p-6 space-y-5">
      <Skeleton className="h-8 w-52 bg-operator-card" />
      <Skeleton className="h-5 w-36 bg-operator-card" />
      {[1, 2].map((i) => (
        <Skeleton key={i} className="h-48 rounded-lg bg-operator-card" />
      ))}
    </div>
  );
}
