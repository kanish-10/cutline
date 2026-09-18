import { type Card, createApiClient } from "@cutline/shared";
import { describe, expect, it, vi } from "vitest";
import {
  availableTags,
  checklistProgress,
  filterCards,
  selectBoardId,
} from "./board-model";

it("fetches the selected second board with its own cards", async () => {
  const boards = [{ id: "first" }, { id: "second" }];
  const second = { id: "second", cards: [card({ boardId: "second" })] };
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => second });
  vi.stubGlobal("fetch", fetch);
  try {
    const selectedId = selectBoardId(boards, "second");
    expect(selectedId).toBe("second");
    const api = createApiClient(
      "http://localhost:3001",
      undefined,
      selectedId ?? undefined,
    );
    expect(await api.getBoard()).toEqual(second);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/boards/second",
      expect.any(Object),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "idea",
    boardId: "board",
    stageId: "backlog",
    title: "Studio tour",
    notes: "Film the morning light",
    checklist: [],
    tags: ["Video", "Studio"],
    links: [],
    archived: false,
    version: 0,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
    publishedAt: null,
    ...overrides,
  };
}

describe("board selection", () => {
  const boards = [{ id: "first" }, { id: "second" }];

  it("starts with the first board and preserves an existing selection", () => {
    expect(selectBoardId(boards, null)).toBe("first");
    expect(selectBoardId(boards, "second")).toBe("second");
    expect(selectBoardId([...boards].reverse(), "first")).toBe("first");
  });

  it("falls back when a selected board is deleted elsewhere", () => {
    expect(selectBoardId(boards, "deleted")).toBe("first");
    expect(selectBoardId([{ id: "first" }], "second")).toBe("first");
  });

  it("returns to onboarding when no boards remain without mutating the list", () => {
    expect(selectBoardId([], "second")).toBeNull();
    expect(selectBoardId([], null)).toBeNull();
    selectBoardId(boards, "second");
    expect(boards).toEqual([{ id: "first" }, { id: "second" }]);
  });
});

describe("board search", () => {
  it("matches all words across title, notes and tags, ignoring whitespace and case", () => {
    const idea = card();
    expect(filterCards([idea], false, "  TOUR   morning VIDEO ", "")).toEqual([
      idea,
    ]);
    expect(filterCards([idea], false, "tour missing", "")).toEqual([]);
  });
  it("combines exact tag filtering with search and keeps archive separate", () => {
    const active = card();
    const archived = card({ id: "archived", archived: true });
    expect(filterCards([active, archived], false, "", "Studio")).toEqual([
      active,
    ]);
    expect(filterCards([active, archived], true, "tour", "Video")).toEqual([
      archived,
    ]);
    expect(filterCards([active], false, "", "video")).toEqual([]);
  });
  it("treats special characters as text, not a regular expression", () => {
    expect(
      filterCards([card({ title: "[Draft] (v2)" })], false, "[draft] (", ""),
    ).toHaveLength(1);
  });
  it("does not mutate or reorder source cards", () => {
    const cards = [card({ id: "first" }), card({ id: "second" })];
    const original = structuredClone(cards);
    expect(filterCards(cards, false, "  ", "")).toEqual(cards);
    availableTags(cards, false);
    expect(cards).toEqual(original);
  });
  it("returns unique sorted tags only from the current view", () => {
    expect(
      availableTags(
        [
          card(),
          card({ tags: ["Audio", "Video"] }),
          card({ archived: true, tags: ["Hidden"] }),
        ],
        false,
      ),
    ).toEqual(["Audio", "Studio", "Video"]);
    expect(availableTags([], true)).toEqual([]);
  });
});

describe("checklist summary", () => {
  it("does not divide by zero for ideas without steps", () => {
    expect(checklistProgress(card())).toEqual({
      done: 0,
      total: 0,
      percent: 0,
    });
  });
  it("counts completed items and rounds progress", () => {
    const checklist = [true, false, false].map((done, index) => ({
      id: String(index),
      text: "Step",
      done,
    }));
    expect(checklistProgress({ checklist })).toEqual({
      done: 1,
      total: 3,
      percent: 33,
    });
    expect(
      checklistProgress({
        checklist: checklist.map((item) => ({ ...item, done: true })),
      }),
    ).toEqual({ done: 3, total: 3, percent: 100 });
  });
});
