import { describe, expect, it } from "vitest";

import { contentMeaningfullyChanged } from "@/lib/email/content-changed";

describe("contentMeaningfullyChanged", () => {
  const base = {
    subject: "Hi",
    sender: "a@b.com",
    snippet: "preview",
    threadId: null as string | null,
  };

  it("is false when all fields match", () => {
    expect(contentMeaningfullyChanged(base, { ...base })).toBe(false);
  });

  it("is true when subject changes", () => {
    expect(
      contentMeaningfullyChanged(base, { ...base, subject: "Re: Hi" }),
    ).toBe(true);
  });

  it("treats null and empty string as equal for each field", () => {
    expect(
      contentMeaningfullyChanged(
        { subject: null, sender: "x", snippet: "y", threadId: null },
        { subject: "", sender: "x", snippet: "y", threadId: null },
      ),
    ).toBe(false);
  });

  it("is true when snippet changes", () => {
    expect(
      contentMeaningfullyChanged(base, { ...base, snippet: "other" }),
    ).toBe(true);
  });
});
