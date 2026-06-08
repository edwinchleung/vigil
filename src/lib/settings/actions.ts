"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SettingsActionState } from "@/lib/settings/types";

const MAX_CLASSIFICATION_POLICY_LEN = 4000;
const GROUNDING_FLOOR_MIN = 0.1;
const GROUNDING_FLOOR_MAX = 0.95;
const GROUNDING_LIMIT_MIN = 1;
const GROUNDING_LIMIT_MAX = 10;
const INTENT_MATCH_MIN = 1;
const INTENT_MATCH_MAX = 15;

export async function updateTelegramChatIdAction(formData: FormData): Promise<SettingsActionState> {
  const user = await requireUser();
  const raw = String(formData.get("telegramChatId") ?? "").trim();
  if (raw.length > 128) {
    return { ok: false, error: "Telegram chat id is too long." };
  }
  const telegramChatId = raw.length === 0 ? null : raw;

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId },
    });
    revalidatePath("/dashboard/settings");
    return { ok: true };
  } catch (e) {
    console.error("[updateTelegramChatIdAction]", e);
    return { ok: false, error: "Could not save settings." };
  }
}

type AiPreferencesPayload = {
  groundingSimilarityFloor?: number;
  groundingExampleLimit?: number;
  intentMatchLimit?: number;
};

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export async function updateClassificationPreferencesAction(
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireUser();
  const policy = String(formData.get("classificationPolicy") ?? "");
  if (policy.length > MAX_CLASSIFICATION_POLICY_LEN) {
    return {
      ok: false,
      error: `Classification policy must be at most ${MAX_CLASSIFICATION_POLICY_LEN} characters.`,
    };
  }

  const floorN = parseOptionalNumber(String(formData.get("groundingSimilarityFloor") ?? ""));
  if (Number.isNaN(floorN)) {
    return { ok: false, error: "Similarity floor must be a number." };
  }
  if (floorN !== null && (floorN < GROUNDING_FLOOR_MIN || floorN > GROUNDING_FLOOR_MAX)) {
    return { ok: false, error: `Similarity floor must be between ${GROUNDING_FLOOR_MIN} and ${GROUNDING_FLOOR_MAX}.` };
  }

  const gLimitN = parseOptionalNumber(String(formData.get("groundingExampleLimit") ?? ""));
  if (Number.isNaN(gLimitN)) {
    return { ok: false, error: "Example limit must be a number." };
  }
  if (gLimitN !== null && (!Number.isInteger(gLimitN) || gLimitN < GROUNDING_LIMIT_MIN || gLimitN > GROUNDING_LIMIT_MAX)) {
    return { ok: false, error: `RAG example count must be an integer from ${GROUNDING_LIMIT_MIN} to ${GROUNDING_LIMIT_MAX}.` };
  }

  const iLimitN = parseOptionalNumber(String(formData.get("intentMatchLimit") ?? ""));
  if (Number.isNaN(iLimitN)) {
    return { ok: false, error: "Intent match limit must be a number." };
  }
  if (iLimitN !== null && (!Number.isInteger(iLimitN) || iLimitN < INTENT_MATCH_MIN || iLimitN > INTENT_MATCH_MAX)) {
    return { ok: false, error: `Intent match limit must be an integer from ${INTENT_MATCH_MIN} to ${INTENT_MATCH_MAX}.` };
  }

  const prefs: AiPreferencesPayload = {};
  if (floorN !== null) prefs.groundingSimilarityFloor = floorN;
  if (gLimitN !== null) prefs.groundingExampleLimit = gLimitN;
  if (iLimitN !== null) prefs.intentMatchLimit = iLimitN;

  const aiPreferences = Object.keys(prefs).length > 0 ? prefs : null;

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        classificationPolicy: policy.trim() === "" ? null : policy.trim(),
        aiPreferences:
          aiPreferences === null
            ? Prisma.DbNull
            : (aiPreferences satisfies Prisma.InputJsonValue),
      },
    });
    revalidatePath("/dashboard/settings");
    return { ok: true };
  } catch (e) {
    console.error("[updateClassificationPreferencesAction]", e);
    return { ok: false, error: "Could not save classification settings." };
  }
}
