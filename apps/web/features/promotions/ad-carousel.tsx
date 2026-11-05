"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { autoplayAllowed, disclosureLabel, nextSlideIndex, type AdSlide } from "@/features/promotions/ads";

const intervalMs = 7000;

export function AdCarousel({ slides }: { slides: readonly AdSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const count = slides.length;
  const current = slides[index] ?? slides[0];
  const playing = autoplayAllowed({ count, paused, reducedMotion, pointerPaused, focusPaused, pageHidden });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setPageHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((value) => nextSlideIndex(value, count, 1));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, count, index]);

  if (!current) return null;

  function show(next: number, manual: boolean) {
    const safe = nextSlideIndex(next, count, 0);
    setIndex(safe);
    const slide = slides[safe];
    if (manual && slide) setAnnouncement(slide.title);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      show(index + 1, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(index - 1, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      show(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      show(count - 1, true);
    }
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="IPO Singh promotions"
      className="grid gap-3"
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setPointerPaused(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setPointerPaused(false);
      }}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setFocusPaused(false);
      }}
    >
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="relative aspect-[780/520] overflow-hidden rounded-panel bg-primary-solid md:aspect-[1200/400]">
        {slides.map((slide, slideIndex) => {
          const active = slideIndex === index;
          const label = disclosureLabel(slide.disclosure);
          return (
            <div key={slide.id} hidden={!active} className="absolute inset-0">
              <SlideLink slide={slide}>
                <picture>
                  <source media="(min-width: 768px)" srcSet={slide.image.desktop.src} width={slide.image.desktop.width} height={slide.image.desktop.height} />
                  <img
                    src={slide.image.mobile.src}
                    width={slide.image.mobile.width}
                    height={slide.image.mobile.height}
                    alt={slide.image.alt}
                    loading={slideIndex === 0 ? "eager" : "lazy"}
                    fetchPriority={slideIndex === 0 ? "high" : "auto"}
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </picture>
                <span className="absolute inset-0 bg-gradient-to-r from-[#080F1A]/80 via-[#080F1A]/45 to-transparent" />
                <span className="absolute inset-0 flex max-w-xl flex-col justify-end gap-2 p-5 text-white sm:p-8">
                  {label ? (
                    <span className="w-fit rounded-control bg-white/15 px-2 py-1 text-xs font-semibold tracking-[0.08em] text-white uppercase">{label}</span>
                  ) : (
                    <span className="text-xs font-semibold tracking-[0.08em] text-white uppercase">IPO Singh</span>
                  )}
                  <span className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{slide.title}</span>
                  <span className="max-w-md text-sm leading-6 text-white/90">{slide.description}</span>
                </span>
              </SlideLink>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-border bg-surface text-foreground" onClick={() => show(index - 1, true)} aria-label="Previous promotion">
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-border bg-surface text-foreground" onClick={() => show(index + 1, true)} aria-label="Next promotion">
            <span aria-hidden="true">›</span>
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center rounded-control border border-border bg-surface px-3 text-sm font-medium text-foreground"
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? "Play" : "Pause"}
          </button>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Promotion slides">
          {slides.map((slide, slideIndex) => {
            const selected = slideIndex === index;
            return (
              <button
                key={slide.id}
                type="button"
                aria-label={`Show ${slide.title}`}
                aria-current={selected ? "true" : undefined}
                className={selected ? "h-11 w-11 rounded-full bg-primary-solid" : "h-11 w-11 rounded-full bg-transparent"}
                onClick={() => show(slideIndex, true)}
              >
                <span className={selected ? "mx-auto block h-2.5 w-2.5 rounded-full bg-primary-foreground" : "mx-auto block h-2.5 w-2.5 rounded-full bg-muted"} />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SlideLink({ slide, children }: { slide: AdSlide; children: ReactNode }) {
  const className = "group relative block h-full text-white focus-visible:outline-2 focus-visible:outline-offset-[-4px]";
  if (slide.href.startsWith("/")) {
    return (
      <Link href={slide.href} prefetch={false} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={slide.href} className={className} rel="sponsored noopener noreferrer">
      {children}
    </a>
  );
}
