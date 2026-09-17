import type { Card } from "@cutline/shared";
import { describe, expect, it } from "vitest";
import { cardChanges, draftOf, parseList } from "./card-draft";

const card: Card = {
  id: "card",
  boardId: "board",
  stageId: "second",
  title: "An idea",
  notes: "Some notes",
  checklist: [{ id: "step-1", text: "First", done: false }],
  tags: ["alpha", "beta"],
  links: ["https://example.com"],
  archived: false,
  version: 2,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
  publishedAt: null,
};

describe("parseList", () => {
  it("splits, trims, and drops empties", () => {
    expect(parseList("a, b ,, c", ",")).toEqual(["a", "b", "c"]);
    expect(parseList(" https://a.dev \n\n https://b.dev ", "\n")).toEqual([
      "https://a.dev",
      "https://b.dev",
    ]);
    expect(parseList("   ", ",")).toEqual([]);
  });

  it("deduplicates while preserving first-seen order", () => {
    expect(parseList("b, a, b, a", ",")).toEqual(["b", "a"]);
  });
});

describe("cardChanges", () => {
  it("sends nothing but the version for an untouched draft", () => {
    expect(cardChanges(card, draftOf(card))).toEqual({ version: 2 });
  });

  it("collects only edited fields and parses list fields", () => {
    const draft = {
      ...draftOf(card),
      title: "New title",
      archived: true,
      tags: " alpha , beta , alpha , ",
      links: "https://example.com\nhttps://example.com\nhttps://other.dev",
    };
    expect(cardChanges(card, draft)).toEqual({
      version: 2,
      title: "New title",
      archived: true,
      tags: ["alpha", "beta"],
      links: ["https://example.com", "https://other.dev"],
    });
  });

  it("detects checklist edits through JSON identity", () => {
    const draft = {
      ...draftOf(card),
      checklist: [{ id: "step-1", text: "First", done: true }],
    };
    expect(cardChanges(card, draft)).toEqual({
      version: 2,
      checklist: [{ id: "step-1", text: "First", done: true }],
    });
  });

  it("round-trips: draft from card produces no changes", () => {
    const draft = draftOf(card);
    expect(cardChanges(card, draft)).toEqual({ version: 2 });
    expect(draftOf(card)).toEqual(draft);
  });
});
