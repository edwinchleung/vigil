import type { EmailProvider } from "@/types/unified-email";

export type SyncRange =
  | { kind: "lastDays"; days: number }
  | { kind: "between"; from: string; to: string };

export type SyncMode = "refetchRecent" | "backfillMissingRaw";

export type SyncBatch = { limit: number; cursor?: string };

export type SyncInboxOptions = {
  providers: EmailProvider[];
  range: SyncRange;
  mode: SyncMode;
  batch: SyncBatch;
};

const DEFAULT_LAST_DAYS = 7;
const DEFAULT_LIMIT = 40;

function parseIntSafe(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function uniqProviders(vs: string[]): EmailProvider[] {
  const out: EmailProvider[] = [];
  for (const v of vs) {
    if (v === "google" || v === "microsoft-entra-id") {
      if (!out.includes(v)) out.push(v);
    }
  }
  return out;
}

export function syncInboxOptionsFromFormData(fd: FormData): SyncInboxOptions {
  const chosen = uniqProviders(fd.getAll("providers").map((x) => String(x)));
  const providers =
    chosen.length > 0 ? chosen : (["google", "microsoft-entra-id"] as EmailProvider[]);

  const modeRaw = String(fd.get("mode") ?? "refetchRecent");
  const mode: SyncMode =
    modeRaw === "backfillMissingRaw" ? "backfillMissingRaw" : "refetchRecent";

  const rangeKind = String(fd.get("rangeKind") ?? "lastDays");
  const range: SyncRange =
    rangeKind === "between"
      ? {
          kind: "between",
          from: String(fd.get("from") ?? ""),
          to: String(fd.get("to") ?? ""),
        }
      : { kind: "lastDays", days: parseIntSafe(fd.get("days")?.toString() ?? null, DEFAULT_LAST_DAYS) };

  const batch: SyncBatch = {
    limit: parseIntSafe(fd.get("limit")?.toString() ?? null, DEFAULT_LIMIT),
    cursor: fd.get("cursor") ? String(fd.get("cursor")) : undefined,
  };

  return { providers, mode, range, batch };
}

