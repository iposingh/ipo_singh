/**
 * Connectivity helpers shared by the React provider and catalogue target reads.
 * Prefer expo-network listeners in the provider; this module stays injectable for tests.
 */

export const reconnectDebounceMs = 1_500;

export type ConnectivitySample = {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
};

export type ConnectivitySnapshot = {
  offline: boolean;
  sampledAt: number;
};

let published: ConnectivitySnapshot | null = null;

/** Match Prompt 66 catalogue-target: only an explicit disconnect is offline. */
export function isDeviceOffline(sample: ConnectivitySample): boolean {
  return sample.isConnected === false;
}

export function publishConnectivity(offline: boolean, sampledAt = Date.now()): ConnectivitySnapshot {
  published = { offline, sampledAt };
  return published;
}

export function readPublishedConnectivity(): ConnectivitySnapshot | null {
  return published;
}

export function clearPublishedConnectivity(): void {
  published = null;
}

/**
 * Debounce offline → online transitions so flaky radios do not spawn retry storms.
 * Going offline again cancels a pending reconnect.
 */
export function createReconnectGate(debounceMs = reconnectDebounceMs, schedule: (fn: () => void, ms: number) => { clear: () => void } = defaultSchedule) {
  let wasOffline = false;
  let pending: { clear: () => void } | null = null;

  return {
    note(offline: boolean, onReconnect: () => void): void {
      if (offline) {
        wasOffline = true;
        if (pending) {
          pending.clear();
          pending = null;
        }
        return;
      }
      if (!wasOffline) return;
      wasOffline = false;
      if (pending) pending.clear();
      pending = schedule(() => {
        pending = null;
        onReconnect();
      }, debounceMs);
    },
    dispose() {
      pending?.clear();
      pending = null;
    },
  };
}

function defaultSchedule(fn: () => void, ms: number): { clear: () => void } {
  const id = setTimeout(fn, ms);
  return { clear: () => clearTimeout(id) };
}
