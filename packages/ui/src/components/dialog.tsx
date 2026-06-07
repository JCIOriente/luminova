import type { ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Centered modal on Radix Dialog, styled with JCI tokens. Used for confirmations. */
export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-jci-black/40 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out motion-reduce:animate-none" />
        <RadixDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface p-[26px] shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)] data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out motion-reduce:animate-none">
          <RadixDialog.Title className="text-[19px] font-semibold tracking-[-0.01em] text-ink-1">
            {title}
          </RadixDialog.Title>
          <RadixDialog.Description
            className={description ? "mt-2 text-[15px] leading-relaxed text-ink-2" : "sr-only"}
          >
            {description ?? title}
          </RadixDialog.Description>
          <div className="mt-[18px]">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
