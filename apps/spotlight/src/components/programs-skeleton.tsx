import { Skeleton } from "@luminova/ui";

export function ProgramsSkeleton() {
  return (
    <div className="program-grid" aria-busy="true" aria-label="Cargando proyectos">
      {/* 6 divides evenly into the 3- and 2-column grid breakpoints — no orphan row. */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="program-card overflow-hidden">
          <Skeleton className="h-[200px] rounded-none" />
          <div className="body flex flex-col gap-[10px]">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3.5 w-[90%]" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
