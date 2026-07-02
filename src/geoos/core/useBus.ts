import { useEffect } from "react";
import { bus, type GeoOSEvents } from "./bus";

/**
 * Subscribe a component to a typed Event Bus channel.
 * Auto-unsubscribes on unmount. Keep handler stable (useCallback) or accept re-subs.
 */
export function useBus<K extends keyof GeoOSEvents>(
  event: K,
  handler: (payload: GeoOSEvents[K]) => void,
) {
  useEffect(() => {
    bus.on(event, handler as never);
    return () => {
      bus.off(event, handler as never);
    };
  }, [event, handler]);
}
