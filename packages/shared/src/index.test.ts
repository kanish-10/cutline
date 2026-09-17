import { describe, expect, it } from "vitest";
import { createCardSchema, safeUrlSchema, updateCardSchema } from "./index";

describe("shared validation", () => {
  it("trims captures and rejects empty titles", () => {
    expect(createCardSchema.parse({ title: "  A new idea  " }).title).toBe(
      "A new idea",
    );
    expect(createCardSchema.safeParse({ title: " " }).success).toBe(false);
  });
  it("rejects unsafe link protocols and credential-bearing URLs", () => {
    expect(safeUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(
      safeUrlSchema.safeParse("https://user:pass@example.com").success,
    ).toBe(false);
    expect(safeUrlSchema.safeParse("https://example.com/video").success).toBe(
      true,
    );
  });
  it("rejects mass assignment and unversioned writes", () => {
    expect(
      updateCardSchema.safeParse({ version: 0, boardId: "another-board" })
        .success,
    ).toBe(false);
    expect(updateCardSchema.safeParse({ title: "New" }).success).toBe(false);
  });
});
