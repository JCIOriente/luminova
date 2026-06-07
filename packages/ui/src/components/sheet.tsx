import type { ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Right-side slide-over on Radix Dialog, styled with JCI tokens. Used for forms. */
export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-jci-black/40 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out motion-reduce:animate-none" />
        <RadixDialog.Content className="fixed top-0 right-0 z-50 flex h-dvh w-full max-w-[440px] flex-col gap-[22px] overflow-y-auto bg-surface p-[26px] shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)] data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out motion-reduce:animate-none">
          <div className="flex items-start justify-between gap-4">
            <RadixDialog.Title className="text-[20px] font-semibold tracking-[-0.01em] text-ink-1">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close
              aria-label="Cerrar"
              className="grid size-[34px] shrink-0 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink-1"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </RadixDialog.Close>
          </div>
          <RadixDialog.Description
            className={description ? "-mt-3 text-[14px] text-ink-2" : "sr-only"}
          >
            {description ?? title}
          </RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
