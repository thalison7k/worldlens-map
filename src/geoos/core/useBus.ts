import { useEffect, useRef } from "react";
import { bus, type GeoOSEvents } from "./bus";

/**
 * Subscribe a component to a typed Event Bus channel.
 * Auto-unsubscribes on unmount. Keep handler stable (useCallback) or accept re-subs.
 */
export function useBus<K extends keyof GeoOSEvents>(
  event: K,
  handler: (payload: GeoOSEvents[K]) => void,
) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const stableHandler = (payload: GeoOSEvents[K]) => handlerRef.current(payload);
    bus.on(event, stableHandler as never);
    return () => {
      bus.off(event, stableHandler as never);
    };
  }, [event]);
}
