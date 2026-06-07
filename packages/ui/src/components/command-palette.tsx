import { useMemo, type ReactNode } from "react";
import { Command } from "cmdk";
import { cn } from "../lib/cn";
import { Icon } from "./icons";

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  keywords?: string[];
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  placeholder?: string;
  emptyText?: string;
}

/** ⌘K command palette on cmdk's Dialog, JCI-token styled. Controlled + presentational. */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = "Buscar o saltar a…",
  emptyText = "Sin resultados",
}: CommandPaletteProps) {
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, CommandItem[]>();
    for (const item of items) {
      const bucket = byGroup.get(item.group);
      if (bucket) {
        bucket.push(item);
      } else {
        order.push(item.group);
        byGroup.set(item.group, [item]);
      }
    }
    return order.map((label) => ({ label, items: byGroup.get(label) ?? [] }));
  }, [items]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={placeholder}
      shouldFilter
      overlayClassName="fixed inset-0 z-50 bg-jci-black/40"
      contentClassName="fixed top-[15vh] left-1/2 z-50 w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 rounded-card border border-line bg-surface shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)]"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3 text-ink-2">
        {Icon.search({ s: 18 })}
        <Command.Input
          placeholder={placeholder}
          className="w-full bg-transparent text-[15px] text-ink-1 outline-none placeholder:text-ink-3"
        />
      </div>
      <Command.List className="scroll max-h-[min(60vh,400px)] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-ink-3">
          {emptyText}
        </Command.Empty>
        {groups.map((group) => (
          <Command.Group
            key={group.label}
            heading={group.label}
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase"
          >
            {group.items.map((item) => (
              <Command.Item
                key={item.id}
                value={`${item.label} ${(item.keywords ?? []).join(" ")}`}
                onSelect={() => {
                  item.onSelect();
                  onOpenChange(false);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium text-ink-2",
                  "data-[selected=true]:bg-jci-blue/10 data-[selected=true]:text-jci-blue",
                )}
              >
                {item.icon && (
                  <span className="flex size-[22px] shrink-0 items-center justify-center">
                    {item.icon}
                  </span>
                )}
                <span className="flex-1 truncate">{item.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
