"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTelegramChatIdAction } from "@/lib/settings/actions";

type Props = {
  defaultTelegramChatId: string | null;
};

export function TelegramSettingsForm({ defaultTelegramChatId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4 max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await updateTelegramChatIdAction(fd);
          if (!res.ok) {
            setError(res.error ?? "Could not save.");
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="telegramChatId">Telegram chat ID</Label>
        <Input
          id="telegramChatId"
          name="telegramChatId"
          type="text"
          autoComplete="off"
          placeholder="e.g. 123456789"
          defaultValue={defaultTelegramChatId ?? ""}
        />
        <p className="text-muted-foreground text-xs">
          Used later for critical bypass notifications. Get your chat id from the Telegram bot when
          that flow is connected.
        </p>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
