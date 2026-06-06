import type { ReactNode } from "react";
import { Root, Trigger, Portal, Content } from "@radix-ui/react-popover";
import { cn } from "../lib/cn";

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  contentClassName?: string;
}

/** Floating surface on Radix Popover, styled with JCI tokens. Shared by Combobox/MultiSelect/menus. */
export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = "start",
  side = "bottom",
  contentClassName,
}: PopoverProps) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger asChild>{trigger}</Trigger>
      <Portal>
        <Content
          align={align}
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 rounded-card border border-line bg-surface p-1 shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)]",
            contentClassName,
          )}
        >
          {children}
        </Content>
      </Portal>
    </Root>
  );
}
