import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface ToastProps {
  message: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * Presentational toast/notification. Show/hide + timeout orchestration stays in
 * the consumer (render conditionally).
 */
export function Toast({ message, icon, className }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-[14px] bg-jci-black px-[22px] py-3.5 text-[14.5px] font-medium text-jci-white shadow-[0_18px_48px_-16px_rgba(19,15,45,0.45)] animate-toast-in",
        className,
      )}
    >
      {icon && (
        <span className="inline-flex text-jci-teal" aria-hidden="true">
          {icon}
        </span>
      )}
      {message}
    </div>
  );
}
