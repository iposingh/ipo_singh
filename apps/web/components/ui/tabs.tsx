"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem = {
  value: string;
  label: string;
  content: ReactNode;
};

type TabsProps = {
  label: string;
  items: readonly TabItem[];
  defaultValue?: string;
};

export function Tabs({ label, items, defaultValue }: TabsProps) {
  const first = items[0]?.value ?? "";
  const [value, setValue] = useState(defaultValue ?? first);

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.value === value);
    if (index < 0) {
      return;
    }
    const last = items.length - 1;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = index === last ? 0 : index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = index === 0 ? last : index - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    } else {
      return;
    }
    event.preventDefault();
    const item = items[next];
    if (item) {
      setValue(item.value);
    }
  }

  return (
    <TabsPrimitive.Root value={value} onValueChange={setValue} className="grid gap-4">
      <TabsPrimitive.List
        aria-label={label}
        onKeyDown={onListKeyDown}
        className="flex gap-1 overflow-x-auto rounded-control border border-border bg-background p-1"
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              "h-10 shrink-0 rounded-control px-3 text-sm font-medium text-muted",
              "data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-card",
            )}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content key={item.value} value={item.value} className="text-sm leading-6 text-foreground">
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
