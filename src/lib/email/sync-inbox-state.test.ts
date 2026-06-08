import { describe, expect, it } from "vitest";

import { initialSyncInboxState } from "@/lib/email/sync-inbox-state";

describe("initialSyncInboxState", () => {
  it("matches minimal sync result shape", () => {
    expect(initialSyncInboxState).toEqual({ upserted: 0, errors: {} });
  });
});
