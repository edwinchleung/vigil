import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("omits falsy values", () => {
    expect(cn("a", false && "b", "c", undefined, null)).toBe("a c");
  });
});
