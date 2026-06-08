import { describe, expect, it } from "vitest";
import type { Email } from "@prisma/client";
import { AiStatus } from "@prisma/client";

import { prismaEmailToInboxView, prismaEmailToUnified } from "@/lib/email/map-prisma";

function makeEmail(over: Partial<Email> = {}): Email {
  const receivedAt = new Date("2025-06-01T10:00:00.000Z");
  return {
    id: "email_1",
    userId: "user_1",
    provider: "google",
    externalId: "ext-1",
    subject: "Hello",
    sender: "me@x.com",
    snippet: "Snip",
    receivedAt,
    isRead: false,
    raw: null,
    threadId: null,
    actions: null,
    createdAt: receivedAt,
    aiStatus: AiStatus.PENDING,
    vigilScore: null,
    category: null,
    summary: null,
    ...over,
  };
}

describe("prismaEmailToUnified", () => {
  it("maps a Prisma row to UnifiedEmail", () => {
    const u = prismaEmailToUnified(makeEmail());
    expect(u.id).toBe("email_1");
    expect(u.externalId).toBe("ext-1");
    expect(u.provider).toBe("google");
    expect(u.content).toBe("Snip");
    expect(u.timestamp).toEqual(new Date("2025-06-01T10:00:00.000Z"));
    expect(u.isRead).toBe(false);
  });

  it("uses empty string when snippet is null", () => {
    const u = prismaEmailToUnified(makeEmail({ snippet: null }));
    expect(u.content).toBe("");
  });
});

describe("prismaEmailToInboxView", () => {
  it("serializes timestamp to ISO string", () => {
    const v = prismaEmailToInboxView(makeEmail());
    expect(v.timestamp).toBe("2025-06-01T10:00:00.000Z");
  });
});
