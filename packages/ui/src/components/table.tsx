import type { ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";

export function Table({ className, ...props }: ComponentPropsWithRef<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-[15px]", className)} {...props} />
    </div>
  );
}

export function TableHeader(props: ComponentPropsWithRef<"thead">) {
  return <thead {...props} />;
}

export function TableBody(props: ComponentPropsWithRef<"tbody">) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }: ComponentPropsWithRef<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-line transition-colors last:border-0 hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentPropsWithRef<"th">) {
  return (
    <th
      className={cn(
        "border-b border-line-strong px-4 py-[11px] text-[11px] font-semibold tracking-[0.10em] text-ink-3 uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentPropsWithRef<"td">) {
  return <td className={cn("px-4 py-3.5 align-middle text-ink-1", className)} {...props} />;
}
