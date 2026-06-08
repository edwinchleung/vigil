"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const intentFields = z.object({
  id: z.string().cuid().optional(),
  query: z.string().trim().min(1, "Describe your active intent.").max(8000, "Intent is too long."),
  /** ISO 8601 from datetime-local or empty */
  deadline: z.string().optional(),
  isActive: z.boolean(),
});

export type IntentActionState = { ok: boolean; error?: string };

type PrismaWithIntentDelegate = typeof prisma & {
  intent: {
    findFirst: (args: unknown) => Promise<{ id: string } | { isActive: boolean } | null>;
    update: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
};

function parseDeadline(s: string | undefined): Date | null {
  if (s == null || s.trim() === "") return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function upsertIntentAction(formData: FormData): Promise<IntentActionState> {
  const user = await requireUser();
  const prismaWithIntent = prisma as unknown as PrismaWithIntentDelegate;

  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.length > 0 ? idRaw : undefined;
  const isActive =
    formData.get("isActive") === "on" || formData.get("isActive") === "true";

  const raw = {
    id,
    query: String(formData.get("query") ?? ""),
    deadline: (() => {
      const v = formData.get("deadline");
      return typeof v === "string" ? v : undefined;
    })(),
    isActive,
  };

  const parsed = intentFields.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    return { ok: false, error: msg };
  }

  const { query, isActive: active } = parsed.data;
  const deadline = parseDeadline(parsed.data.deadline);
  if (parsed.data.deadline && parsed.data.deadline.trim() !== "" && deadline == null) {
    return { ok: false, error: "Invalid deadline." };
  }

  try {
    if (parsed.data.id) {
      const existing = await prismaWithIntent.intent.findFirst({
        where: { id: parsed.data.id, userId: user.id },
        select: { id: true },
      });
      if (!existing) {
        return { ok: false, error: "Intent not found." };
      }
      await prismaWithIntent.intent.update({
        where: { id: parsed.data.id },
        data: { query, deadline, isActive: active },
      });
    } else {
      await prismaWithIntent.intent.create({
        data: {
          userId: user.id,
          query,
          deadline,
          isActive: active,
        },
      });
    }
    revalidatePath("/dashboard/intents");
    revalidatePath("/dashboard/inbox");
    return { ok: true };
  } catch (e) {
    console.error("[upsertIntentAction]", e);
    return { ok: false, error: "Could not save intent." };
  }
}

/**
 * Delete an intent (form action — returns `void` for Next.js `<form action>` typing).
 * Use from server-rendered forms or with `encType` and hidden `id`.
 */
export async function deleteIntentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const prismaWithIntent = prisma as unknown as PrismaWithIntentDelegate;
  const idRaw = formData.get("id");
  if (typeof idRaw !== "string" || idRaw.length === 0) {
    console.warn("[deleteIntentAction] missing id");
    return;
  }
  const id = z.string().cuid().safeParse(idRaw);
  if (!id.success) {
    console.warn("[deleteIntentAction] invalid id");
    return;
  }

  try {
    const r = await prismaWithIntent.intent.deleteMany({
      where: { id: id.data, userId: user.id },
    });
    if (r.count === 0) {
      return;
    }
    revalidatePath("/dashboard/intents");
    revalidatePath("/dashboard/inbox");
  } catch (e) {
    console.error("[deleteIntentAction]", e);
  }
}

export async function toggleIntentActiveAction(formData: FormData): Promise<IntentActionState> {
  const user = await requireUser();
  const prismaWithIntent = prisma as unknown as PrismaWithIntentDelegate;
  const idRaw = formData.get("id");
  if (typeof idRaw !== "string" || idRaw.length === 0) {
    return { ok: false, error: "Missing intent id." };
  }
  const id = z.string().cuid().safeParse(idRaw);
  if (!id.success) {
    return { ok: false, error: "Invalid intent id." };
  }

  try {
    const row = await prismaWithIntent.intent.findFirst({
      where: { id: id.data, userId: user.id },
      select: { isActive: true },
    });
    if (!row || !("isActive" in row)) {
      return { ok: false, error: "Intent not found." };
    }
    await prismaWithIntent.intent.update({
      where: { id: id.data },
      data: { isActive: !row.isActive },
    });
    revalidatePath("/dashboard/intents");
    revalidatePath("/dashboard/inbox");
    return { ok: true };
  } catch (e) {
    console.error("[toggleIntentActiveAction]", e);
    return { ok: false, error: "Could not update intent." };
  }
}
