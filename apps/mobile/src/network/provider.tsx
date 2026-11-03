import * as Network from "expo-network";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { createReconnectGate, isDeviceOffline, publishConnectivity } from "./connectivity";

export type NetworkContextValue = {
  offline: boolean;
  ready: boolean;
  /** Increments once per debounced offline→online recovery (and optional foreground recovery). */
  reconnectGeneration: number;
};

const NetworkContext = createContext<NetworkContextValue>({
  offline: false,
  ready: false,
  reconnectGeneration: 0,
});

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}

/**
 * Soft-refresh when connectivity returns. Skips the initial mount generation.
 * Keep handlers cheap; catalogue flights already dedupe concurrent fetches.
 */
export function useOnReconnect(handler: () => void): void {
  const { reconnectGeneration } = useNetwork();
  const seen = useRef(reconnectGeneration);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (seen.current === reconnectGeneration) return;
    seen.current = reconnectGeneration;
    handlerRef.current();
  }, [reconnectGeneration]);
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(false);
  const [ready, setReady] = useState(false);
  const [reconnectGeneration, setReconnectGeneration] = useState(0);
  const gateRef = useRef(createReconnectGate());

  useEffect(() => {
    const gate = gateRef.current;
    let active = true;

    function apply(sample: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) {
      if (!active) return;
      const next = isDeviceOffline(sample);
      publishConnectivity(next);
      setOffline(next);
      setReady(true);
      gate.note(next, () => {
        if (!active) return;
        setReconnectGeneration((value) => value + 1);
      });
    }

    void Network.getNetworkStateAsync()
      .then(apply)
      .catch(() => {
        if (!active) return;
        publishConnectivity(false);
        setReady(true);
      });

    const subscription = Network.addNetworkStateListener(apply);
    const appSubscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void Network.getNetworkStateAsync()
        .then(apply)
        .catch(() => undefined);
    });

    return () => {
      active = false;
      subscription.remove();
      appSubscription.remove();
      gate.dispose();
    };
  }, []);

  const value = useMemo(
    () => ({
      offline,
      ready,
      reconnectGeneration,
    }),
    [offline, ready, reconnectGeneration],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}
