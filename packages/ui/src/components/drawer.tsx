import type { ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { cn } from "../lib/cn";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edge the panel slides from. Defaults to `left`. */
  side?: "left" | "right";
  /** Accessible name (sr-only) — the panel renders no visible chrome. */
  title: string;
  children: ReactNode;
  /** Controls the panel width (e.g. `w-[264px]`). Defaults to fit content. */
  className?: string;
}

/**
 * Chrome-free edge drawer on Radix Dialog: focus trap, scroll lock, inert
 * background, and Escape for free. The caller supplies its own header/close.
 */
export function Drawer({
  open,
  onOpenChange,
  side = "left",
  title,
  children,
  className,
}: DrawerProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-jci-black/40 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out motion-reduce:animate-none" />
        <RadixDialog.Content
          className={cn(
            "fixed top-0 z-50 h-dvh w-fit shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)] motion-reduce:animate-none",
            side === "left"
              ? "left-0 data-[state=open]:animate-sheet-in-left data-[state=closed]:animate-sheet-out-left"
              : "right-0 data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
            className,
          )}
        >
          <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
