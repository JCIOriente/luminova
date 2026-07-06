import { useId, useState, type ReactNode } from "react";
import { Badge, Card, Icon, cn } from "@luminova/ui";

interface CollapsibleSectionProps {
  num: string;
  icon: ReactNode;
  title: string;
  desc: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  num,
  icon,
  title,
  desc,
  count,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <Card as="section" padding="none" className="overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-200 ease-expo hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-jci-blue"
      >
        <span className="font-mono text-ui-xs font-semibold text-jci-blue">{num}</span>
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-jci-blue/12 text-jci-blue">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink-1">{title}</span>
          <span className="block truncate text-ui-sm text-ink-3">{desc}</span>
        </span>
        {count !== undefined && <Badge tone="blue">{count}</Badge>}
        <span className="text-ink-3">
          <span
            className={cn(
              "block transition-transform duration-200 ease-expo",
              open && "rotate-180",
            )}
          >
            {Icon.chevExpand({ s: 18 })}
          </span>
        </span>
      </button>
      {open && (
        <div id={bodyId} className="border-t border-line px-5 py-5">
          {children}
        </div>
      )}
    </Card>
  );
}
