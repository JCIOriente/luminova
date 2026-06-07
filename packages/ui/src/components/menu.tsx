import type { ReactNode } from "react";
import { Root, Trigger, Portal, Content, Item, Separator } from "@radix-ui/react-dropdown-menu";
import { cn } from "../lib/cn";

interface MenuProps {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  contentClassName?: string;
}

/**
 * Dropdown menu on Radix DropdownMenu, styled with JCI tokens. Real menu
 * keyboard semantics (arrow / Home·End / typeahead, roving focus) plus the
 * shared `menu-in/out` pop animation. Use for row action menus and overflow
 * (⋯) menus — not for selecting a value (use Combobox/Select).
 */
export function Menu({
  trigger,
  children,
  open,
  onOpenChange,
  align = "end",
  side = "bottom",
  contentClassName,
}: MenuProps) {
  // modal={false} is required: a modal menu sets `body { pointer-events: none }`,
  // and selecting an item that opens a Dialog/Sheet makes that Dialog capture the
  // "none" as its value to restore on close — leaving the page unclickable. A
  // non-modal action menu avoids the body lock entirely.
  return (
    <Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Trigger asChild>{trigger}</Trigger>
      <Portal>
        <Content
          align={align}
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 min-w-[200px] origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-card border border-line bg-surface p-1.5 shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)] data-[state=open]:animate-menu-in data-[state=closed]:animate-menu-out motion-reduce:animate-none",
            contentClassName,
          )}
        >
          {children}
        </Content>
      </Portal>
    </Root>
  );
}

interface MenuItemProps {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function MenuItem({ children, onSelect, danger, disabled }: MenuItemProps) {
  return (
    <Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "cursor-pointer rounded-[9px] px-3 py-2 text-[13.5px] font-medium outline-none transition-colors select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        danger
          ? "text-error data-[highlighted]:bg-error/10"
          : "text-ink-2 data-[highlighted]:bg-ink-1/[0.05] data-[highlighted]:text-ink-1",
      )}
    >
      {children}
    </Item>
  );
}

export function MenuSeparator() {
  return <Separator className="my-1 h-px bg-line" />;
}
