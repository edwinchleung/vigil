import type { Prisma } from "@prisma/client";

/**
 * Inbox list display helpers (relative time, user-facing error copy).
 */

/** Tri-tier + full list (Milestone 4 contract). */
export type InboxTierTab = "all" | "critical" | "relevant" | "low";

export function emailMatchesInboxTier(
  category: string | null | undefined,
  tab: InboxTierTab,
): boolean {
  if (tab === "all") return true;
  const c = (category ?? "").trim().toLowerCase();
  if (tab === "critical") return c === "critical";
  if (tab === "relevant") return c === "relevant";
  if (tab === "low") return c === "low-value" || c === "low value";
  return false;
}

/** Short line for `Email.actions` JSON (arrays of strings or task-like objects). */
export function formatExtractedActions(
  actions: Prisma.JsonValue | null,
): string | null {
  if (actions == null) return null;
  if (Array.isArray(actions)) {
    if (actions.length === 0) return null;
    const parts: string[] = [];
    for (const x of actions) {
      if (typeof x === "string") {
        parts.push(x);
        continue;
      }
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        const t = o["title"] ?? o["text"] ?? o["label"] ?? o["action"];
        if (typeof t === "string" && t.length > 0) {
          parts.push(t);
        }
      }
    }
    if (parts.length === 0) return "Extracted actions";
    if (parts.length === 1) return parts[0]!;
    return `${parts[0]!} +${parts.length - 1} more`;
  }
  if (typeof actions === "object" && actions !== null) {
    return "Has actions";
  }
  return null;
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString();
}

export function friendlyError(msg: string): string {
  if (/401|403|re-authenticate|Invalid grant|insufficient|consent|expired/i.test(msg)) {
    return "Session may be invalid. Reconnect this provider on the dashboard.";
  }
  return msg;
}
