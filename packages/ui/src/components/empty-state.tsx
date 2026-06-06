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
    <div className="flex flex-col items-center gap-1.5 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <h3 className="text-[17px] font-semibold text-ink-1">{title}</h3>
      {description && <p className="mt-1 mb-4 max-w-[360px] text-[14px] leading-relaxed text-ink-3">{description}</p>}
      {action}
    </div>
  );
}
