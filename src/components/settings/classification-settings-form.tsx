"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClassificationPreferencesAction } from "@/lib/settings/actions";
import { cn } from "@/lib/utils";

type AiPrefs = {
  groundingSimilarityFloor: number | null;
  groundingExampleLimit: number | null;
  intentMatchLimit: number | null;
} | null;

type Props = {
  defaultPolicy: string | null;
  defaultAiPreferences: AiPrefs;
};

export function ClassificationSettingsForm({ defaultPolicy, defaultAiPreferences }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const p = defaultAiPreferences;

  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await updateClassificationPreferencesAction(fd);
          if (!res.ok) {
            setError(res.error ?? "Could not save.");
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="classificationPolicy">Classification policy</Label>
        <textarea
          id="classificationPolicy"
          name="classificationPolicy"
          rows={8}
          defaultValue={defaultPolicy ?? ""}
          maxLength={4000}
          className={cn(
            "border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-2 text-base transition-colors outline-none focus-visible:ring-3 disabled:opacity-50 md:text-sm dark:bg-input/30",
          )}
          placeholder='Example: "I am a product manager. Treat vendor cold outreach as Low-Value unless it mentions our active roadmap themes. Deprioritize automated CI notifications."'
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Optional. The Context Engine uses this together with your active intents. It does not
          change the three inbox tiers (Critical / Relevant / Low-Value) — it steers how emails are
          placed within them. Max 4000 characters.
        </p>
      </div>

      <details className="space-y-3 rounded-lg border border-border/60 p-4">
        <summary className="cursor-pointer text-sm font-medium">Advanced: retrieval overrides</summary>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Leave a field empty to use the app default. Values are validated and clamped on the
          server.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="groundingSimilarityFloor">RAG similarity floor</Label>
            <Input
              id="groundingSimilarityFloor"
              name="groundingSimilarityFloor"
              type="text"
              inputMode="decimal"
              placeholder="default"
              defaultValue={p?.groundingSimilarityFloor ?? ""}
            />
            <p className="text-muted-foreground text-xs">0.1–0.95</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="groundingExampleLimit">RAG example count</Label>
            <Input
              id="groundingExampleLimit"
              name="groundingExampleLimit"
              type="text"
              inputMode="numeric"
              placeholder="default"
              defaultValue={p?.groundingExampleLimit ?? ""}
            />
            <p className="text-muted-foreground text-xs">1–10</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="intentMatchLimit">Intent match limit</Label>
            <Input
              id="intentMatchLimit"
              name="intentMatchLimit"
              type="text"
              inputMode="numeric"
              placeholder="default"
              defaultValue={p?.intentMatchLimit ?? ""}
            />
            <p className="text-muted-foreground text-xs">1–15</p>
          </div>
        </div>
      </details>

      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save classification settings"}
      </Button>
    </form>
  );
}
