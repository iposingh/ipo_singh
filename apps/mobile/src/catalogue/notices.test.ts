import assert from "node:assert/strict";
import test from "node:test";
import { fallbackCacheNote, offlineCacheNote } from "./response-cache.ts";
import { boardListNotice } from "./notices.ts";

test("board notices prefer offline wording and never imply live market data", () => {
  assert.match(offlineCacheNote, /may not be current/i);
  assert.match(fallbackCacheNote, /may not be current/i);
  assert.equal(
    boardListNotice([{ phase: "ready", message: null, cacheReason: "offline", cacheNote: null }]),
    offlineCacheNote,
  );
  assert.equal(
    boardListNotice([{ phase: "ready", message: null, cacheReason: "fallback", cacheNote: null }]),
    fallbackCacheNote,
  );
  assert.equal(
    boardListNotice([{ phase: "ready", message: "Partial section issue.", cacheReason: null, cacheNote: null }]),
    "Partial section issue.",
  );
});
