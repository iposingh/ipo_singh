"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { ipoDetailSectionHref, ipoDetailSections, isIpoDetailSectionId, type IpoDetailSectionId } from "@/features/ipo-details/detail-sections";

export function IpoDetailNav() {
  const [current, setCurrent] = useState<IpoDetailSectionId | null>(null);

  useEffect(() => {
    function sync() {
      const id = window.location.hash.replace(/^#/, "");
      setCurrent(isIpoDetailSectionId(id) ? id : null);
      if (!isIpoDetailSectionId(id)) return;
      const target = document.getElementById(id);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: "start" });
        target.focus({ preventScroll: true });
      }
    }

    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <nav
      aria-label="IPO sections"
      className="sticky top-[5.25rem] z-20 -mx-4 min-w-0 overflow-x-auto border-y border-border bg-background/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:top-[8.25rem] lg:-mx-8 lg:px-8"
    >
      <ul className="flex w-max min-w-full gap-1">
        {ipoDetailSections.map((section) => {
          const selected = current === section.id;
          return (
            <li key={section.id} className="shrink-0">
              <a
                href={ipoDetailSectionHref(section.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-control px-3 text-sm font-medium",
                  selected ? "bg-surface text-foreground shadow-card" : "text-muted",
                )}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
