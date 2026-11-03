"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

type DrawerProps = {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
};

export function Drawer({ trigger, title, description, children }: DrawerProps) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#0F172A]/40" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-panel border border-border bg-surface p-5 text-foreground shadow-card md:inset-y-0 md:right-0 md:left-auto md:w-[24rem] md:max-h-none md:rounded-none md:border-y-0 md:border-r-0">
          <div className="flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="inline-flex size-11 items-center justify-center rounded-control hover:bg-background"
              aria-label="Close drawer"
            >
              ×
            </DialogPrimitive.Close>
          </div>
          {description ? (
            <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className="mt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
