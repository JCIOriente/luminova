import { cn } from "../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[8px] bg-[length:200%_100%] bg-gradient-to-r from-ink-1/[0.04] via-line to-ink-1/[0.04] animate-skeleton motion-reduce:animate-none",
        className,
      )}
      aria-hidden="true"
    />
  );
}
