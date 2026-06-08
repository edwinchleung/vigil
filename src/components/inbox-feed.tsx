"use client";

import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Brain, Loader2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GoogleIcon, MicrosoftIcon } from "@/components/brand-icons";
import { syncInboxAction } from "@/lib/email/actions";
import { initialSyncInboxState } from "@/lib/email/sync-inbox-state";
import type { Prisma } from "@prisma/client";

import type { InboxEmailView } from "@/lib/email/map-prisma";
import {
  emailMatchesInboxTier,
  formatExtractedActions,
  formatRelativeTime,
  friendlyError,
} from "@/lib/inbox/inbox-display";
import type { InboxTierTab } from "@/lib/inbox/inbox-display";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";
import type { SyncMode } from "@/lib/email/sync-options";

const PROVIDER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  google: GoogleIcon,
  "microsoft-entra-id": MicrosoftIcon,
};

const PROVIDER_LABEL: Record<string, string> = {
  google: "Gmail",
  "microsoft-entra-id": "Outlook",
};

function isAiStatus(
  v: unknown,
): v is InboxEmailView["aiStatus"] {
  return v === "PENDING" || v === "PROCESSING" || v === "COMPLETED" || v === "FAILED";
}

function mergeInboxViewFromRow(
  prev: InboxEmailView,
  row: Record<string, unknown>,
): InboxEmailView {
  const next: InboxEmailView = { ...prev };
  if (isAiStatus(row["aiStatus"])) next.aiStatus = row["aiStatus"];
  if ("vigilScore" in row) next.vigilScore = row["vigilScore"] as number | null;
  if ("category" in row) next.category = row["category"] as string | null;
  if ("summary" in row) next.summary = row["summary"] as string | null;
  if (typeof row["isRead"] === "boolean") next.isRead = row["isRead"];
  if (row["subject"] !== undefined) next.subject = row["subject"] as string | null;
  if (row["sender"] !== undefined) next.sender = row["sender"] as string | null;
  if (row["snippet"] !== undefined) next.content = typeof row["snippet"] === "string" ? row["snippet"] : "";
  if (typeof row["receivedAt"] === "string") next.timestamp = row["receivedAt"];
  if ("threadId" in row) next.threadId = (row["threadId"] as string | null) ?? null;
  if ("actions" in row) {
    const a = row["actions"];
    next.actions = a == null ? null : (a as Prisma.JsonValue);
  }
  return next;
}

export function InboxFeed({
  initialEmails,
  hasLinkedAccount,
  userId,
}: {
  initialEmails: InboxEmailView[];
  hasLinkedAccount: boolean;
  userId: string;
}) {
  const [query, setQuery] = useState("");
  const [tierTab, setTierTab] = useState<InboxTierTab>("all");
  const [showOptions, setShowOptions] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [providers, setProviders] = useState<Record<"google" | "microsoft-entra-id", boolean>>({
    google: true,
    "microsoft-entra-id": true,
  });
  const [mode, setMode] = useState<SyncMode>("refetchRecent");
  const [rangeKind, setRangeKind] = useState<"lastDays" | "between">("lastDays");
  const [days, setDays] = useState("7");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState("40");
  /** Realtime overlays on top of `initialEmails` from the server (avoids a sync setState in an effect). */
  const [realtimeById, setRealtimeById] = useState<
    Record<string, Partial<InboxEmailView>>
  >({});
  const [analyzeAllPending, setAnalyzeAllPending] = useState(false);
  const [analyzeAllError, setAnalyzeAllError] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    syncInboxAction,
    initialSyncInboxState,
  );
  const syncErrors = state?.errors ?? {};
  const upserted = state?.upserted ?? 0;
  const nextCursor = state?.nextCursor;
  const autoResumeIntentRef = useRef(false);

  const nextBatchFormRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!autoSync) return;
    if (!nextCursor) {
      queueMicrotask(() => {
        setAutoSync(false);
        setBatchCount(0);
        autoResumeIntentRef.current = false;
      });
    }
  }, [autoSync, nextCursor]);

  /** After a rate / busy response, stop auto so we don’t hammer; resume if the user had Auto on. */
  useEffect(() => {
    if (!state?.limitReason || state.retryAfterSec == null) return;
    if (!autoResumeIntentRef.current) return;
    queueMicrotask(() => setAutoSync(false));
    const ms = state.retryAfterSec * 1000;
    const t = setTimeout(() => {
      if (autoResumeIntentRef.current) setAutoSync(true);
    }, ms);
    return () => clearTimeout(t);
  }, [state?.at, state?.limitReason, state?.retryAfterSec]);

  useEffect(() => {
    if (!autoSync) return;
    if (!nextCursor) return;
    if (isPending) return;

    const t = setTimeout(() => {
      const form = nextBatchFormRef.current;
      if (!form) return;
      setBatchCount((n) => n + 1);
      form.requestSubmit();
    }, 500);

    return () => clearTimeout(t);
  }, [autoSync, nextCursor, isPending]);

  const initialEmailsRef = useRef(initialEmails);
  useLayoutEffect(() => {
    initialEmailsRef.current = initialEmails;
  }, [initialEmails]);

  const emails = useMemo(() => {
    return initialEmails.map((e) => {
      const r = realtimeById[e.id];
      return r ? { ...e, ...r, id: e.id, externalId: e.externalId, provider: e.provider } : e;
    });
  }, [initialEmails, realtimeById]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`email-updates-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Email",
          filter: `userId=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row || typeof row["id"] !== "string") return;
          const id = row["id"] as string;
          setRealtimeById((prev) => {
            const base = initialEmailsRef.current.find((e) => e.id === id);
            if (!base) return prev;
            const merged = mergeInboxViewFromRow(
              { ...base, ...prev[id] } as InboxEmailView,
              row,
            );
            return { ...prev, [id]: merged };
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter((e) => {
      const sub = (e.subject ?? "").toLowerCase();
      const from = (e.sender ?? "").toLowerCase();
      const content = (e.content ?? "").toLowerCase();
      return sub.includes(q) || from.includes(q) || content.includes(q);
    });
  }, [emails, query]);

  const tierFiltered = useMemo(
    () => filtered.filter((e) => emailMatchesInboxTier(e.category, tierTab)),
    [filtered, tierTab],
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Search subject, sender, or preview…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full sm:max-w-md"
            />
            <div className="flex flex-col gap-2 shrink-0 sm:ms-2 sm:items-end">
              <button
                type="button"
                className={buttonVariants({ variant: "secondary" })}
                onClick={() => setShowOptions((v) => !v)}
              >
                {showOptions ? "Hide options" : "Sync options"}
              </button>

              <form action={formAction} className="flex items-center gap-2">
                <input type="hidden" name="mode" value={mode} />
                <input type="hidden" name="rangeKind" value={rangeKind} />
                <input type="hidden" name="days" value={days} />
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <input type="hidden" name="limit" value={limit} />
                {providers.google && <input type="hidden" name="providers" value="google" />}
                {providers["microsoft-entra-id"] && (
                  <input type="hidden" name="providers" value="microsoft-entra-id" />
                )}
                <button
                  type="submit"
                  disabled={isPending || autoSync}
                  className={buttonVariants({ variant: "default" })}
                >
                  {isPending ? "Syncing…" : "Sync"}
                </button>
                <button
                  type="button"
                  disabled={analyzeAllPending}
                  className={buttonVariants({ variant: "secondary" })}
                  onClick={async () => {
                    setAnalyzeAllError(null);
                    setAnalyzeAllPending(true);
                    try {
                      const res = await fetch("/api/analysis-request", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ mode: "all_unanalyzed" }),
                      });
                      if (!res.ok) {
                        const data = (await res.json().catch(() => null)) as
                          | { error?: string }
                          | null;
                        throw new Error(data?.error || "Failed to request analysis");
                      }
                    } catch (e) {
                      setAnalyzeAllError(
                        e instanceof Error ? e.message : "Failed to request analysis",
                      );
                    } finally {
                      setAnalyzeAllPending(false);
                    }
                  }}
                >
                  {analyzeAllPending ? "Requesting…" : "Analyze all not analyzed"}
                </button>
              </form>

              {nextCursor && (
                <div className="flex flex-col gap-2 sm:items-end">
                  <div className="flex items-center gap-2">
                    {!autoSync ? (
                      <button
                        type="button"
                        disabled={isPending}
                        className={buttonVariants({ variant: "secondary" })}
                        onClick={() => {
                          autoResumeIntentRef.current = true;
                          setAutoSync(true);
                        }}
                      >
                        Auto sync
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={buttonVariants({ variant: "secondary" })}
                        onClick={() => {
                          autoResumeIntentRef.current = false;
                          setAutoSync(false);
                        }}
                      >
                        Stop
                      </button>
                    )}
                    {autoSync && (
                      <span className="text-xs text-muted-foreground">
                        Auto-syncing… (batch {batchCount})
                      </span>
                    )}
                  </div>

                  <form
                    ref={nextBatchFormRef}
                    action={formAction}
                    className="flex items-center gap-2"
                  >
                  <input type="hidden" name="mode" value={mode} />
                  <input type="hidden" name="rangeKind" value={rangeKind} />
                  <input type="hidden" name="days" value={days} />
                  <input type="hidden" name="from" value={from} />
                  <input type="hidden" name="to" value={to} />
                  <input type="hidden" name="limit" value={limit} />
                  <input type="hidden" name="cursor" value={nextCursor} />
                  {providers.google && <input type="hidden" name="providers" value="google" />}
                  {providers["microsoft-entra-id"] && (
                    <input type="hidden" name="providers" value="microsoft-entra-id" />
                  )}
                  <button
                    type="submit"
                    disabled={isPending || autoSync}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    {isPending ? "Syncing…" : "Sync next batch"}
                  </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {showOptions && (
            <div className="mt-4 space-y-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={providers.google}
                      onChange={(e) =>
                        setProviders((p) => ({ ...p, google: e.target.checked }))
                      }
                    />
                    <span>Gmail</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={providers["microsoft-entra-id"]}
                      onChange={(e) =>
                        setProviders((p) => ({
                          ...p,
                          "microsoft-entra-id": e.target.checked,
                        }))
                      }
                    />
                    <span>Outlook</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">Batch size</span>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="40">40</option>
                    <option value="100">100</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">Mode</span>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as SyncMode)}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="refetchRecent">Re-fetch recent</option>
                    <option value="backfillMissingRaw">Backfill missing raw</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">Date range</span>
                  <select
                    value={rangeKind}
                    onChange={(e) => setRangeKind(e.target.value as "lastDays" | "between")}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="lastDays">Last N days</option>
                    <option value="between">Between</option>
                  </select>
                  {rangeKind === "lastDays" ? (
                    <select
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    >
                      <option value="1">1</option>
                      <option value="7">7</option>
                      <option value="30">30</option>
                      <option value="90">90</option>
                    </select>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                      />
                      <span className="text-muted-foreground text-xs">to</span>
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>

              {mode === "backfillMissingRaw" && (
                <p className="text-muted-foreground text-xs">
                  Backfill fetches messages by <code className="font-mono">externalId</code> for DB
                  rows where <code className="font-mono">raw IS NULL</code>. Use “Sync next batch”
                  to continue.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {analyzeAllError && (
        <p className="text-sm text-amber-800 dark:text-amber-500">{analyzeAllError}</p>
      )}

      {state?.at && (
        <p className="text-xs text-muted-foreground">
          Last sync: {upserted} row(s) written at {new Date(state.at).toLocaleString()}
          {state.mode ? ` • mode=${state.mode}` : ""}
          {state.providers?.length ? ` • providers=${state.providers.join(",")}` : ""}.
        </p>
      )}

      {state?.limitReason && state.retryAfterSec != null && (
        <p className="text-sm text-amber-800 dark:text-amber-500">
          {state.limitReason === "busy"
            ? `Another sync is still running. You can try again in about ${state.retryAfterSec}s.`
            : `Sync is rate-limited. Try again in about ${state.retryAfterSec}s.`}
        </p>
      )}

      {Object.keys(syncErrors).length > 0 && (
        <ul className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          {syncErrors.google && (
            <li>
              <span className="font-medium">Gmail: </span>
              {friendlyError(syncErrors.google)}
            </li>
          )}
          {syncErrors["microsoft-entra-id"] && (
            <li>
              <span className="font-medium">Outlook: </span>
              {friendlyError(syncErrors["microsoft-entra-id"])}
            </li>
          )}
        </ul>
      )}

      {emails.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/50 px-6 py-10 text-center sm:px-8">
          <h2 className="text-foreground text-base font-semibold">
            {hasLinkedAccount ? "No messages yet" : "No mailbox linked"}
          </h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
            {hasLinkedAccount ? (
              <>
                Your inbox is empty. Use <strong className="text-foreground">Sync inbox</strong>{" "}
                to load recent mail from your connected account(s).
              </>
            ) : (
              <>
                Connect Gmail or Outlook on the dashboard, then return here to sync.{" "}
                <Link
                  href="/dashboard"
                  className={buttonVariants({ variant: "link", className: "h-auto p-0" })}
                >
                  Go to dashboard
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      {emails.length > 0 && (
        <div className="space-y-3">
          <div
            className="flex flex-wrap items-center gap-2"
            role="tablist"
            aria-label="Filter by tri-tier category"
          >
            {(
              [
                ["all", "All"],
                ["critical", "Critical"],
                ["relevant", "Relevant"],
                ["low", "Low-Value"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`inbox-tier-${id}`}
                aria-selected={tierTab === id}
                aria-controls="inbox-message-list"
                onClick={() => setTierTab(id as InboxTierTab)}
                className={cn(
                  buttonVariants({
                    variant: tierTab === id ? "default" : "outline",
                    size: "sm",
                  }),
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tierFiltered.length > 0 ? (
          <ul
            id="inbox-message-list"
            className="divide-border/80 divide-y overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm"
            role="tabpanel"
            aria-label="Inbox messages"
          >
            {tierFiltered.map((e) => {
            const Icon = PROVIDER_ICONS[e.provider] ?? GoogleIcon;
            const showScanning =
              e.aiStatus === "PENDING" || e.aiStatus === "PROCESSING";
            const showCompleted = e.aiStatus === "COMPLETED";
            const actionLine = formatExtractedActions(e.actions);
            const processing = e.aiStatus === "PROCESSING";

            return (
              <li key={e.id}>
                <Link
                  href={`/dashboard/inbox/${e.id}`}
                  aria-label={`Open email details: ${e.subject || "no subject"}`}
                  className={cn(
                    "hover:bg-muted/40 focus-visible:ring-ring/50 focus-visible:outline-ring flex flex-col gap-1 border-l-[3px] px-4 py-3.5 transition-colors focus-visible:ring-[3px] focus-visible:outline-1 sm:flex-row sm:items-start sm:gap-4",
                    e.isRead
                      ? "border-l-transparent bg-background"
                      : "border-l-primary bg-primary/[0.04]",
                    processing && "animate-pulse",
                  )}
                >
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Icon className="h-5 w-5" aria-hidden />
                    <Badge variant="outline" className="text-xs">
                      {PROVIDER_LABEL[e.provider] ?? e.provider}
                    </Badge>
                    {showScanning && (
                      <Badge
                        variant="secondary"
                        className="text-xs gap-1 font-normal"
                      >
                        {e.aiStatus === "PROCESSING" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Brain className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {e.aiStatus === "PROCESSING" ? "Analyzing" : "Scanning"}
                      </Badge>
                    )}
                    {e.aiStatus === "FAILED" && (
                      <span className="text-xs text-amber-700 dark:text-amber-500">AI failed</span>
                    )}
                    {e.vigilScore != null && (
                      <Badge variant="default" className="text-xs gap-1 font-normal tabular-nums">
                        <span className="sr-only">Vigil score</span>
                        <span aria-hidden>Vigil</span> {e.vigilScore}
                      </Badge>
                    )}
                    {e.category && (
                      <Badge variant="secondary" className="text-xs">
                        {e.category}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(e.timestamp)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${e.isRead ? "font-medium" : "font-semibold"}`}>
                      {e.subject || "(no subject)"}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">{e.sender || "—"}</p>
                    {e.content && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{e.content}</p>
                    )}
                    {actionLine && (
                      <p className="text-muted-foreground/90 mt-1 line-clamp-2 text-xs">
                        <span className="font-medium text-foreground/80">Actions: </span>
                        {actionLine}
                      </p>
                    )}
                    {showCompleted && e.summary && (
                      <p className="text-muted-foreground/90 mt-1 line-clamp-2 text-xs italic">
                        {e.summary}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
          ) : (
            <p
              id="inbox-message-list"
              className="text-muted-foreground text-sm"
              role="status"
            >
              No messages in this tri-tier for the current search.
            </p>
          )}
        </div>
      )}

      {emails.length > 0 && filtered.length === 0 && (
        <p className="text-muted-foreground text-sm">No messages match your search.</p>
      )}
    </div>
  );
}
