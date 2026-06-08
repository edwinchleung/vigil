import { describe, expect, it } from "vitest";

import { retryAfterFromLastSync, retryAfterFromLock } from "@/lib/email/retry-after";

describe("retry-after helpers", () => {
  it("retryAfterFromLastSync computes seconds until the window ends", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const last = new Date("2026-01-01T00:00:00.000Z");
    expect(retryAfterFromLastSync(last, 60, now)).toBe(60);
  });

  it("retryAfterFromLock uses lock expiry", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const until = new Date("2026-01-01T00:00:20.000Z");
    expect(retryAfterFromLock(until, now)).toBe(20);
  });
});
