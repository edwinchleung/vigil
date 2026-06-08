"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Brain, Loader2 } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { InboxActionsList } from "@/components/inbox-actions-list";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

export type InboxEmailDetailModel = {
  id: string;
  userId: string;
  provider: string;
  externalId: string;
  threadId: string | null;
  subject: string | null;
  sender: string | null;
  snippet: string | null;
  receivedAt: string;
  isRead: boolean;
  aiStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  vigilScore: number | null;
  category: string | null;
  summary: string | null;
  actions: Prisma.JsonValue | null;
  raw: Prisma.JsonValue | null;
};

function isAiStatus(v: unknown): v is InboxEmailDetailModel["aiStatus"] {
  return v === "PENDING" || v === "PROCESSING" || v === "COMPLETED" || v === "FAILED";
}

function mergeFromRow(
  prev: InboxEmailDetailModel,
  row: Record<string, unknown>,
): InboxEmailDetailModel {
  const next: InboxEmailDetailModel = { ...prev };
  if (isAiStatus(row["aiStatus"])) next.aiStatus = row["aiStatus"];
  if ("vigilScore" in row) next.vigilScore = row["vigilScore"] as number | null;
  if ("category" in row) next.category = row["category"] as string | null;
  if ("summary" in row) next.summary = row["summary"] as string | null;
  if ("threadId" in row) next.threadId = (row["threadId"] as string | null) ?? null;
  if ("actions" in row) next.actions = (row["actions"] as Prisma.JsonValue) ?? null;
  if ("raw" in row) next.raw = (row["raw"] as Prisma.JsonValue) ?? null;
  if (typeof row["isRead"] === "boolean") next.isRead = row["isRead"];
  if (row["subject"] !== undefined) next.subject = row["subject"] as string | null;
  if (row["sender"] !== undefined) next.sender = row["sender"] as string | null;
  if (row["snippet"] !== undefined) next.snippet = row["snippet"] as string | null;
  if (typeof row["receivedAt"] === "string") next.receivedAt = row["receivedAt"];
  return next;
}

export function InboxEmailDetail({
  initialEmail,
  enableRealtime = true,
}: {
  initialEmail: InboxEmailDetailModel;
  enableRealtime?: boolean;
}) {
  const [email, setEmail] = useState<InboxEmailDetailModel>(initialEmail);
  const [showRaw, setShowRaw] = useState(false);
  const [analyzePending, setAnalyzePending] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  useEffect(() => {
    if (!enableRealtime) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`email-detail-${initialEmail.userId}-${initialEmail.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Email",
          filter: `id=eq.${initialEmail.id},userId=eq.${initialEmail.userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;
          setEmail((prev) => mergeFromRow(prev, row));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enableRealtime, initialEmail.id, initialEmail.userId]);

  const statusBadge = useMemo(() => {
    if (email.aiStatus === "FAILED") {
      return <Badge variant="secondary">AI failed</Badge>;
    }
    if (email.aiStatus === "PROCESSING") {
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Analyzing
        </Badge>
      );
    }
    if (email.aiStatus === "PENDING") {
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Brain className="h-3.5 w-3.5" aria-hidden />
          Scanning
        </Badge>
      );
    }
    return <Badge variant="default">AI complete</Badge>;
  }, [email.aiStatus]);

  const receivedLabel = useMemo(() => {
    const d = new Date(email.receivedAt);
    return Number.isNaN(d.getTime()) ? email.receivedAt : d.toLocaleString();
  }, [email.receivedAt]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">Inbox</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            {email.subject || "(no subject)"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {email.sender || "—"} • {receivedLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/inbox"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to inbox
          </Link>
          <Button
            type="button"
            variant="default"
            disabled={analyzePending || email.aiStatus === "PROCESSING"}
            onClick={async () => {
              setAnalyzeError(null);
              setAnalyzePending(true);
              try {
                const res = await fetch("/api/analysis-request", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ mode: "single", emailId: initialEmail.id }),
                });
                if (!res.ok) {
                  const data = (await res.json().catch(() => null)) as { error?: string } | null;
                  throw new Error(data?.error || "Failed to request analysis");
                }
              } catch (e) {
                setAnalyzeError(e instanceof Error ? e.message : "Failed to request analysis");
              } finally {
                setAnalyzePending(false);
              }
            }}
          >
            {analyzePending ? "Requesting…" : "Analyze this email"}
          </Button>
        </div>
      </div>

      {analyzeError && (
        <p className="text-sm text-amber-800 dark:text-amber-500">{analyzeError}</p>
      )}

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="space-y-4 pt-5 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge}
            {email.vigilScore != null && (
              <Badge variant="default" className="font-normal tabular-nums">
                Vigil {email.vigilScore}
              </Badge>
            )}
            {email.category && <Badge variant="secondary">{email.category}</Badge>}
            <Badge variant="outline" className="font-normal">
              {email.provider}
            </Badge>
            {email.threadId && (
              <Badge variant="outline" className="font-normal">
                Thread {email.threadId}
              </Badge>
            )}
          </div>

          <Separator />

          <section className="space-y-2">
            <h2 className="text-base font-medium">AI summary</h2>
            {email.aiStatus === "COMPLETED" && email.summary ? (
              <p className="text-sm leading-relaxed">{email.summary}</p>
            ) : email.aiStatus === "FAILED" ? (
              <p className="text-muted-foreground text-sm">
                The AI pipeline failed for this email. You can still review the message metadata
                and raw payload.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                This email is still being analyzed. If Realtime is configured, this page will
                update automatically once results are ready.
              </p>
            )}
          </section>

          <Separator />

          <section className="space-y-2">
            <h2 className="text-base font-medium">Extracted actions</h2>
            <InboxActionsList actions={email.actions} />
          </section>

          <Separator />

          <section className="space-y-2">
            <h2 className="text-base font-medium">Message preview</h2>
            {email.snippet ? (
              <p className="text-muted-foreground text-sm leading-relaxed">{email.snippet}</p>
            ) : (
              <p className="text-muted-foreground text-sm">No snippet available.</p>
            )}
            <div className="text-muted-foreground text-xs">
              <span className={cn(!email.isRead && "text-foreground font-medium")}>
                {email.isRead ? "Read" : "Unread"}
              </span>
              <span aria-hidden> • </span>
              <span className="font-mono">externalId={email.externalId}</span>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-medium">Raw provider payload</h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRaw((v) => !v)}
              >
                {showRaw ? "Hide raw" : "Show raw"}
              </Button>
            </div>
            {showRaw ? (
              email.raw != null ? (
                <pre className="max-h-[520px] overflow-auto rounded-xl border border-border/70 bg-muted/20 p-3 text-xs leading-relaxed">
                  {JSON.stringify(email.raw, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground text-sm">No raw payload stored.</p>
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                Raw payload can be large; expand only when needed.
              </p>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

