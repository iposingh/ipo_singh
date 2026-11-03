import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPublishedConnectivity,
  createReconnectGate,
  isDeviceOffline,
  publishConnectivity,
  readPublishedConnectivity,
  reconnectDebounceMs,
} from "./connectivity.ts";

test("only an explicit disconnect counts as offline", () => {
  assert.equal(isDeviceOffline({ isConnected: false }), true);
  assert.equal(isDeviceOffline({ isConnected: true }), false);
  assert.equal(isDeviceOffline({ isConnected: true, isInternetReachable: false }), false);
  assert.equal(isDeviceOffline({ isConnected: null }), false);
  assert.equal(isDeviceOffline({}), false);
});

test("published connectivity is readable by non-React catalogue reads", () => {
  clearPublishedConnectivity();
  assert.equal(readPublishedConnectivity(), null);
  publishConnectivity(true, 100);
  assert.deepEqual(readPublishedConnectivity(), { offline: true, sampledAt: 100 });
  publishConnectivity(false, 200);
  assert.deepEqual(readPublishedConnectivity(), { offline: false, sampledAt: 200 });
  clearPublishedConnectivity();
});

test("reconnect gate debounces recovery and cancels when offline returns", () => {
  assert.equal(reconnectDebounceMs, 1_500);
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const gate = createReconnectGate(50, (fn, ms) => {
    const entry = { fn, ms, cleared: false };
    timers.push(entry);
    return {
      clear() {
        entry.cleared = true;
      },
    };
  });
  let reconnects = 0;
  gate.note(true, () => {
    reconnects += 1;
  });
  gate.note(false, () => {
    reconnects += 1;
  });
  assert.equal(timers.length, 1);
  assert.equal(timers[0]?.ms, 50);
  assert.equal(reconnects, 0);

  gate.note(true, () => {
    reconnects += 1;
  });
  assert.equal(timers[0]?.cleared, true);

  gate.note(false, () => {
    reconnects += 1;
  });
  timers[1]?.fn();
  assert.equal(reconnects, 1);

  gate.note(false, () => {
    reconnects += 1;
  });
  assert.equal(timers.length, 2);
  assert.equal(reconnects, 1);

  gate.dispose();
});
