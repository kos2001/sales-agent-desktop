// Human-readable formatting for the chat agent status indicator. Kept
// pure so it can be unit-tested independently of the React tree.

/** How long with no SSE activity counts as "the agent may be stuck". */
export const STALENESS_THRESHOLD_MS = 3_000;

/**
 * Compact elapsed-time label: "3s", "47s", "1m 5s", "12m 03s".
 * For sub-second durations returns "0s" (we never want to flicker on
 * <1s phases — the human eye doesn't see them anyway).
 */
export function formatElapsed(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  // Pad seconds when minutes are present so the layout doesn't jitter
  // each tick (`1m 9s` → `1m 10s` shifts width otherwise).
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

/**
 * If the agent has been quiet for longer than the threshold, return a
 * "idle for Ns" label. Otherwise null — the indicator shouldn't show
 * anything for brief gaps between events.
 */
export function formatStaleness(staleMs: number): string | null {
  if (staleMs < STALENESS_THRESHOLD_MS) return null;
  return `idle for ${formatElapsed(staleMs)}`;
}
