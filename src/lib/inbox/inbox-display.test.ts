import { describe, expect, it } from "vitest";

import {
  emailMatchesInboxTier,
  formatExtractedActions,
  formatRelativeTime,
  friendlyError,
} from "@/lib/inbox/inbox-display";

describe("formatRelativeTime", () => {
  it('returns "Just now" for very recent times', () => {
    const now = new Date("2025-01-15T12:00:00.000Z");
    const iso = new Date(now.getTime() - 30_000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe("Just now");
  });

  it("returns minutes ago in range", () => {
    const now = new Date("2025-01-15T12:00:00.000Z");
    const iso = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe("5m ago");
  });

  it("returns a locale date string for old messages", () => {
    const now = new Date("2025-01-15T12:00:00.000Z");
    const iso = new Date("2020-01-01T00:00:00.000Z").toISOString();
    const out = formatRelativeTime(iso, now);
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/ago$/);
  });
});

describe("emailMatchesInboxTier", () => {
  it("all tab matches any category", () => {
    expect(emailMatchesInboxTier(null, "all")).toBe(true);
    expect(emailMatchesInboxTier("Critical", "all")).toBe(true);
  });

  it("matches tri-tier labels case-insensitively", () => {
    expect(emailMatchesInboxTier("critical", "critical")).toBe(true);
    expect(emailMatchesInboxTier("Relevant", "relevant")).toBe(true);
    expect(emailMatchesInboxTier("Low-Value", "low")).toBe(true);
    expect(emailMatchesInboxTier("Low Value", "low")).toBe(true);
  });

  it("excludes unknown or null category from tier tabs", () => {
    expect(emailMatchesInboxTier(null, "critical")).toBe(false);
    expect(emailMatchesInboxTier("spam", "relevant")).toBe(false);
  });
});

describe("formatExtractedActions", () => {
  it("returns null for empty input", () => {
    expect(formatExtractedActions(null)).toBeNull();
    expect(formatExtractedActions([])).toBeNull();
  });

  it("summarizes string arrays", () => {
    expect(formatExtractedActions(["Reply by Friday", "Send resume"])).toBe(
      "Reply by Friday +1 more",
    );
  });
});

describe("friendlyError", () => {
  it("rewrites auth-style errors to a user hint", () => {
    expect(friendlyError("401 from provider")).toBe(
      "Session may be invalid. Reconnect this provider on the dashboard.",
    );
  });

  it("returns the original message when not a known pattern", () => {
    expect(friendlyError("Network timeout")).toBe("Network timeout");
  });
});
