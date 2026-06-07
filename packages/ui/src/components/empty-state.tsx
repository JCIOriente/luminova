import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-[18px] grid size-14 place-items-center rounded-2xl border border-line bg-surface-2 text-ink-3">
          {icon}
        </div>
      )}
      <h3 className="text-[17px] font-semibold text-ink-1">{title}</h3>
      {description && (
        <p className="mt-2 mb-[18px] max-w-[360px] text-[14px] leading-relaxed text-ink-3">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
