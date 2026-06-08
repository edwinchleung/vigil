/** In-process sliding window limiter (per Node instance; sufficient to cap bursts). */

const WINDOW_MS = 60_000;

function prune(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => now - t < WINDOW_MS);
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

export function createRateLimiter(maxPerWindow: number) {
  const buckets = new Map<string, number[]>();

  return function limit(key: string): RateLimitResult {
    const now = Date.now();
    const prev = buckets.get(key) ?? [];
    const recent = prune(prev, now);
    if (recent.length >= maxPerWindow) {
      const oldest = recent[0]!;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
      return { ok: false, retryAfterSec };
    }
    recent.push(now);
    buckets.set(key, recent);
    return { ok: true };
  };
}
