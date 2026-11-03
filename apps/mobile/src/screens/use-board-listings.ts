import { useCallback, useEffect, useRef, useState } from "react";
import type { Board } from "@ipo-singh/contracts";
import { MobileApiError } from "../api/errors";
import { catalogueClient } from "../catalogue/client";
import type { BoardSectionState } from "../catalogue/board-state";
import type { CataloguePage, CatalogueRequest } from "../catalogue/listings";
import { boardListNotice } from "../catalogue/notices";
import { listingSections, type ListingSectionId } from "../catalogue/sections";
import { useOnReconnect } from "../network/provider";
import { readCatalogueTarget } from "./catalogue-target";

function blankSection(id: ListingSectionId): BoardSectionState {
  return {
    id,
    phase: "loading",
    message: null,
    items: [],
    nextCursor: null,
    totalCount: null,
    loadingMore: false,
    moreError: null,
    cacheReason: null,
    cacheNote: null,
  };
}

function applyPage(id: ListingSectionId, page: CataloguePage, previous: BoardSectionState | null, keepPrevious: boolean): BoardSectionState {
  if (page.status === "ready") {
    return {
      id,
      phase: "ready",
      message: null,
      items: page.items,
      nextCursor: page.nextCursor,
      totalCount: page.totalCount,
      loadingMore: false,
      moreError: null,
      cacheReason: page.cacheReason,
      cacheNote: page.cacheNote,
    };
  }
  if (keepPrevious && previous?.phase === "ready") {
    return { ...previous, message: page.message, loadingMore: false, moreError: null };
  }
  return {
    id,
    phase: "error",
    message: page.message,
    items: [],
    nextCursor: null,
    totalCount: null,
    loadingMore: false,
    moreError: null,
    cacheReason: null,
    cacheNote: page.cacheNote,
  };
}

export function useBoardListings(board: Board) {
  const [sections, setSections] = useState<BoardSectionState[]>(() => listingSections(board).map((section) => blankSection(section.id)));
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const sectionsRef = useRef(sections);
  const loadRef = useRef<(signal: AbortSignal, force: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    sectionsRef.current = sections;
  });

  async function loadAll(id: number, signal: AbortSignal, force: boolean) {
    const target = await readCatalogueTarget();
    if (signal.aborted || id !== requestId.current) return;
    if ("error" in target) {
      const failed = listingSections(board).map((section) => ({ ...blankSection(section.id), phase: "error" as const, message: target.error }));
      sectionsRef.current = failed;
      setSections(failed);
      setRefreshing(false);
      return;
    }
    const request: CatalogueRequest = { origin: target.origin, offline: target.offline, force, signal };
    const specs = listingSections(board);
    const pages = await Promise.all(specs.map((section) => catalogueClient().loadListing(board, section, undefined, request)));
    if (signal.aborted || id !== requestId.current) return;
    const next = specs.map((section, index) => {
      const page = pages[index];
      const previous = sectionsRef.current.find((item) => item.id === section.id) ?? null;
      return page ? applyPage(section.id, page, previous, force) : blankSection(section.id);
    });
    sectionsRef.current = next;
    setSections(next);
    setRefreshing(false);
  }

  useEffect(() => {
    loadRef.current = (signal, force) => loadAll(requestId.current, signal, force);
  });

  useEffect(() => {
    requestId.current += 1;
    const controller = new AbortController();
    abortRef.current = controller;
    void loadRef.current(controller.signal, false);
    return () => controller.abort();
  }, [board]);

  const softReload = useCallback(() => {
    requestId.current += 1;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void loadRef.current(controller.signal, false);
  }, []);

  useOnReconnect(softReload);

  function reload() {
    requestId.current += 1;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRefreshing(true);
    void loadRef.current(controller.signal, true);
  }

  function loadMore(id: ListingSectionId) {
    const section = sectionsRef.current.find((item) => item.id === id);
    const spec = listingSections(board).find((item) => item.id === id);
    if (!section?.nextCursor || section.loadingMore || !spec) return;
    const cursor = section.nextCursor;
    const idAtStart = requestId.current;
    setSections((current) => current.map((item) => (item.id === id ? { ...item, loadingMore: true, moreError: null } : item)));
    void (async () => {
      const target = await readCatalogueTarget();
      if (idAtStart !== requestId.current) return;
      if ("error" in target) {
        setSections((current) => current.map((item) => (item.id === id ? { ...item, loadingMore: false, moreError: target.error } : item)));
        return;
      }
      try {
        const page = await catalogueClient().loadListing(board, spec, cursor, {
          origin: target.origin,
          offline: target.offline,
          signal: abortRef.current?.signal,
        });
        if (idAtStart !== requestId.current) return;
        if (page.status !== "ready") {
          setSections((current) => current.map((item) => (item.id === id ? { ...item, loadingMore: false, moreError: page.message } : item)));
          return;
        }
        setSections((current) => {
          const updated = current.map((item) => {
            if (item.id !== id || item.phase !== "ready") return item;
            const seen = new Set(item.items.map((ipo) => ipo.id));
            return {
              ...item,
              items: [...item.items, ...page.items.filter((ipo) => !seen.has(ipo.id))],
              nextCursor: page.nextCursor,
              totalCount: page.totalCount ?? item.totalCount,
              loadingMore: false,
              moreError: null,
              cacheReason: page.cacheReason ?? item.cacheReason,
              cacheNote: page.cacheNote ?? item.cacheNote,
            };
          });
          sectionsRef.current = updated;
          return updated;
        });
      } catch (error) {
        if (idAtStart !== requestId.current) return;
        if (error instanceof MobileApiError && error.kind === "cancelled") return;
        setSections((current) => current.map((item) => (item.id === id ? { ...item, loadingMore: false, moreError: "More issues could not be loaded." } : item)));
      }
    })();
  }

  return { sections, details: {}, refreshing, notice: boardListNotice(sections), reload, loadMore };
}
