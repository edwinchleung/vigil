import { describe, expect, it } from "vitest";

import { createRateLimiter } from "@/lib/rate-limit-memory";

describe("createRateLimiter", () => {
  it("allows requests under the cap", () => {
    const limit = createRateLimiter(3);
    expect(limit("a").ok).toBe(true);
    expect(limit("a").ok).toBe(true);
    expect(limit("a").ok).toBe(true);
  });

  it("rejects when the cap is exceeded for the same key", () => {
    const limit = createRateLimiter(2);
    expect(limit("k").ok).toBe(true);
    expect(limit("k").ok).toBe(true);
    const r = limit("k");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("keeps separate buckets per key", () => {
    const limit = createRateLimiter(1);
    expect(limit("x").ok).toBe(true);
    expect(limit("y").ok).toBe(true);
  });
});
