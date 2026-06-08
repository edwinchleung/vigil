"use client";

import { useCallback, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Pencil, Trash2 } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  deleteIntentAction,
  toggleIntentActiveAction,
  upsertIntentAction,
} from "@/lib/intents/actions";

/** List row without `embedding` (Unsupported in Prisma — omitted from queries). */
export type IntentListItem = {
  id: string;
  userId: string;
  query: string;
  deadline: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const intentFormSchema = z.object({
  query: z
    .string()
    .min(1, "Describe your active intent.")
    .max(8000, "Intent is too long."),
  isActive: z.boolean(),
  deadline: z.date().optional().nullable(),
});

type IntentFormValues = z.infer<typeof intentFormSchema>;

const defaultForm: IntentFormValues = {
  query: "",
  isActive: true,
  deadline: null,
};

type Props = {
  intents: IntentListItem[];
};

export function IntentManager({ intents }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<IntentFormValues>({
    resolver: zodResolver(intentFormSchema),
    defaultValues: defaultForm,
  });

  const resetToNew = useCallback(() => {
    setEditingId(null);
    form.reset(defaultForm);
    setFormError(null);
  }, [form]);

  const startEdit = useCallback(
    (row: IntentListItem) => {
      setEditingId(row.id);
      setFormError(null);
      form.reset({
        query: row.query,
        isActive: row.isActive,
        deadline: row.deadline,
      });
    },
    [form],
  );

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const fd = new FormData();
      if (editingId) {
        fd.set("id", editingId);
      }
      fd.set("query", values.query);
      fd.set("isActive", values.isActive ? "on" : "off");
      if (values.deadline) {
        fd.set("deadline", values.deadline.toISOString());
      }
      const res = await upsertIntentAction(fd);
      if (!res.ok) {
        setFormError(res.error ?? "Could not save.");
        return;
      }
      form.reset(defaultForm);
      setEditingId(null);
    });
  });

  const deadlineWatch = useWatch({ control: form.control, name: "deadline" });
  const isActiveWatch = useWatch({ control: form.control, name: "isActive" });

  return (
    <div className="space-y-8">
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle className="text-lg">
            {editingId ? "Edit active intent" : "New active intent"}
          </CardTitle>
          <CardDescription>
            Natural-language goals the Context Engine will use to rank mail (e.g. job search,
            visa deadlines, investor updates).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="intent-query">Intent</Label>
              <textarea
                id="intent-query"
                rows={4}
                className={cn(
                  "border-border bg-background ring-offset-background placeholder:text-muted-foreground",
                  "focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm",
                  "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
                placeholder="I am applying for senior developer roles; expect replies from recruiters and take-home assignments."
                {...form.register("query")}
              />
              {form.formState.errors.query && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.query.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Label>Deadline (optional)</Label>
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      "border-border bg-background ring-offset-background",
                      "inline-flex h-9 w-full min-w-[200px] items-center justify-start rounded-md border px-3 text-left text-sm",
                      "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                      "sm:max-w-xs",
                    )}
                    type="button"
                  >
                    <CalendarIcon className="text-muted-foreground mr-2 h-4 w-4" />
                    {deadlineWatch ? format(deadlineWatch, "PPP") : "Pick a date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={deadlineWatch ?? undefined}
                      onSelect={(d) => form.setValue("deadline", d ?? null, { shouldValidate: true })}
                    />
                    <div className="border-t border-border p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => form.setValue("deadline", null)}
                      >
                        Clear date
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2 pb-0.5">
                <Switch
                  id="intent-active"
                  checked={isActiveWatch}
                  onCheckedChange={(v) => form.setValue("isActive", v)}
                />
                <Label htmlFor="intent-active" className="cursor-pointer">
                  Intent is active
                </Label>
              </div>
            </div>

            {formError && <p className="text-destructive text-sm">{formError}</p>}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : editingId ? "Save changes" : "Add intent"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetToNew} disabled={pending}>
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {intents.length > 0 && (
        <div>
          <h2 className="text-foreground mb-3 text-sm font-semibold">Your intents</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {intents.map((i) => (
              <Card key={i.id} className="relative shadow-sm ring-1 ring-border/60">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base line-clamp-3">{i.query}</CardTitle>
                      <CardDescription className="mt-1.5 text-xs">
                        {i.deadline
                          ? `Deadline: ${format(i.deadline, "PPP")}`
                          : "No deadline"}
                        {" · "}
                        {i.isActive ? "Active" : "Paused"}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => startEdit(i)}
                        aria-label="Edit intent"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <form action={deleteIntentAction} className="inline">
                        <input type="hidden" name="id" value={i.id} />
                        <Button
                          type="submit"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="Delete intent"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between border-t border-border/60 pt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Active</span>
                    <Switch
                      checked={i.isActive}
                      onCheckedChange={() => {
                        startTransition(async () => {
                          const fd = new FormData();
                          fd.set("id", i.id);
                          await toggleIntentActiveAction(fd);
                        });
                      }}
                      disabled={pending}
                      aria-label={i.isActive ? "Deactivate intent" : "Activate intent"}
                    />
                  </div>
                  <span className="text-muted-foreground text-xs">
                    Updated {format(i.updatedAt, "PP p")}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
