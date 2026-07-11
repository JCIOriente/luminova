import type { ReactNode } from "react";

/** Card header (title + subtitle + trailing icon) shared by panel widgets. */
export function WidgetHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between border-b border-line px-6 py-4">
      <div>
        <h2 className="text-ui-lg font-semibold text-ink-1">{title}</h2>
        <div className="mt-0.5 text-ui-xs text-ink-3">{subtitle}</div>
      </div>
      <span className="text-ink-3">{icon}</span>
    </header>
  );
}
