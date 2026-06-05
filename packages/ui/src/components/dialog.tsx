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
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-jci-black/40" />
        <RadixDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface p-6 shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)]">
          <RadixDialog.Title className="text-[18px] font-semibold text-ink-1">
            {title}
          </RadixDialog.Title>
          <RadixDialog.Description
            className={description ? "mt-2 text-[15px] text-ink-2" : "sr-only"}
          >
            {description ?? title}
          </RadixDialog.Description>
          <div className="mt-5">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
