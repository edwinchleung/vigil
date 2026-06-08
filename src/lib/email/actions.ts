"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  releaseUserSyncLock,
  tryAcquireUserSyncLock,
  tryTakeSyncRateSlot,
} from "@/lib/email/sync-guards";
import type { SyncInboxState } from "@/lib/email/sync-inbox-state";
import { syncInboxForUser } from "@/lib/email/sync";
import { syncInboxOptionsFromFormData } from "@/lib/email/sync-options";

export async function syncInboxAction(
  _prev: SyncInboxState,
  formData: FormData,
): Promise<SyncInboxState> {
  void _prev;
  const user = await requireUser();
  const options = syncInboxOptionsFromFormData(formData);
  const at = new Date().toISOString();

  const base = {
    at,
    mode: options.mode,
    providers: options.providers,
  } satisfies Partial<SyncInboxState>;

  const reject = (retryAfterSec: number, limitReason: SyncInboxState["limitReason"]): SyncInboxState => {
    revalidatePath("/dashboard/inbox");
    return {
      upserted: 0,
      errors: {},
      ...base,
      limitReason,
      retryAfterSec,
    };
  };

  const lock = await tryAcquireUserSyncLock(user.id);
  if (!lock.ok) {
    return reject(lock.retryAfterSec, "busy");
  }
  try {
    const rate = await tryTakeSyncRateSlot(user.id);
    if (!rate.ok) {
      return reject(rate.retryAfterSec, "rate");
    }
    const result = await syncInboxForUser(user.id, options);
    revalidatePath("/dashboard/inbox");
    return {
      upserted: result.upserted,
      errors: result.errors ?? {},
      ...base,
      nextCursor: result.nextCursor,
    };
  } finally {
    await releaseUserSyncLock(user.id);
  }
}
