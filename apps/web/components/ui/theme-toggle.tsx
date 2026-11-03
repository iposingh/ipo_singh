"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { IconButton } from "@/components/ui/icon-button";
import type { ThemeChoice } from "@/lib/theme/theme";

const options: readonly { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeToggle() {
  const { choice, colorScheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const nextScheme = colorScheme === "dark" ? "light" : "dark";

  useEffect(() => {
    if (!open) {
      return;
    }
    const selected = options.findIndex((option) => option.value === choice);
    refs.current[selected]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choice, open]);

  function move(nextIndex: number) {
    const option = options[nextIndex];
    if (!option) {
      return;
    }
    setTheme(option.value);
    refs.current[nextIndex]?.focus();
  }

  return (
    <div className="relative inline-flex items-center gap-1">
      <IconButton
        variant="secondary"
        aria-label={nextScheme === "dark" ? "Switch to dark theme" : "Switch to light theme"}
        onClick={() => setTheme(nextScheme)}
      >
        {colorScheme === "dark" ? <SunIcon /> : <MoonIcon />}
      </IconButton>
      <span className="sr-only">
        {choice === "system"
          ? `System theme is on and currently ${colorScheme}. System follows this device's appearance setting.`
          : `${choice} theme is on.`}
      </span>
      <button
        type="button"
        className="inline-flex h-11 items-center rounded-control border border-border bg-surface px-3 text-sm font-medium text-foreground"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        Theme
      </button>
      {open ? (
        <div
          id={menuId}
          role="radiogroup"
          aria-label="Color theme"
          className="absolute top-12 right-0 z-40 w-64 rounded-control border border-border bg-surface p-3 text-foreground shadow-card"
          onKeyDown={(event) => {
            const index = options.findIndex((option) => option.value === choice);
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              move((index + 1) % options.length);
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              move((index - 1 + options.length) % options.length);
            }
          }}
        >
          <p className="text-sm leading-6 text-muted">System follows this device&apos;s appearance setting.</p>
          <div className="mt-2 grid gap-1">
            {options.map((option, index) => {
              const selected = choice === option.value;
              return (
                <button
                  key={option.value}
                  ref={(node) => {
                    refs.current[index] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  data-theme-choice={option.value}
                  className="flex h-10 items-center justify-between rounded-control px-3 text-left text-sm font-medium text-foreground hover:bg-background"
                  onClick={() => {
                    setTheme(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                  {selected ? <span aria-hidden>✓</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 3.5A8.5 8.5 0 1 0 20.5 14 7 7 0 0 1 16 3.5Z" />
    </svg>
  );
}
