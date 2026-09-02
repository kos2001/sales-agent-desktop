import { useEffect, useState } from "react";

/**
 * Returns an integer that increments every `intervalMs` while `active`
 * is true. Useful for forcing a re-render once a second so a derived
 * "elapsed time" string updates without owning its own time state.
 *
 * Returns 0 (and starts no timer) when inactive — keeps idle chat
 * conversations off the event loop.
 */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return tick;
}
