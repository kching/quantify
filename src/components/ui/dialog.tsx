"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const DialogRoot = Dialog.Root;
export const DialogPortal = Dialog.Portal;
export const DialogTrigger = Dialog.Trigger;
export const DialogClose = Dialog.Close;
export const DialogTitle = Dialog.Title;
export const DialogDescription = Dialog.Description;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Dialog.Popup>) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
        <Dialog.Popup
          className={cn(
            "relative w-full max-w-lg rounded-xl border bg-background p-6 text-foreground shadow-xl outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
          <Dialog.Close
            aria-label="Close dialog"
            className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  );
}
