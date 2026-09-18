import type { Board, Card } from "@cutline/shared";
import { describe, expect, it } from "vitest";
import { isLocalHost } from "./api";
import { replaceCard, undoInput } from "./board-state";

const card: Card = {
  id: "card",
  boardId: "board",
  stageId: "second",
  title: "An idea",
  notes: "",
  checklist: [],
  tags: [],
  links: [],
  archived: false,
  version: 2,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
  publishedAt: null,
};
const board: Board = {
  id: "board",
  name: "My board",
  createdAt: "2026-09-17T00:00:00.000Z",
  creatorType: "video",
  cards: [card],
  stages: [
    {
      id: "first",
      boardId: "board",
      name: "Backlog",
      color: "#948C79",
      position: 0,
    },
    {
      id: "second",
      boardId: "board",
      name: "Script",
      color: "#7C6BAE",
      position: 1,
    },
  ],
};
const undo = { card, previousStageId: "first", expiresAt: 5000 };

describe("localhost detection", () => {
  it("accepts loopback and private ranges", () => {
    for (const host of [
      "localhost",
      "[::1]",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.7",
      "172.16.1.1",
      "172.31.9.9",
    ])
      expect(isLocalHost(host)).toBe(true);
  });
  it("rejects public, spoofed, and malformed hosts", () => {
    for (const host of [
      "example.com",
      "cutline.local",
      "192.168.1.4.example.com",
      "172.15.0.1",
      "172.32.0.1",
      "8.8.8.8",
      "999.1.1.1",
      "1.2.3",
      "",
    ])
      expect(isLocalHost(host)).toBe(false);
  });
});

describe("advance undo", () => {
  it("uses the version returned by the move", () => {
    expect(undoInput(board, undo, 4999)).toEqual({
      version: 2,
      stageId: "first",
    });
  });
  it("expires at the shared undo deadline", () => {
    expect(() => undoInput(board, undo, 5000)).toThrow("expired");
  });
  it("refuses to overwrite concurrent edits or moves", () => {
    expect(() =>
      undoInput({ ...board, cards: [{ ...card, version: 3 }] }, undo, 1),
    ).toThrow("changed");
    expect(() =>
      undoInput({ ...board, cards: [{ ...card, stageId: "first" }] }, undo, 1),
    ).toThrow("changed");
  });
  it("handles removed cards and stages", () => {
    expect(() => undoInput(null, undo, 1)).toThrow("changed");
    expect(() => undoInput({ ...board, stages: [] }, undo, 1)).toThrow(
      "no longer exists",
    );
  });
});

describe("board cache updates", () => {
  it("replaces saved cards without mutating the previous board", () => {
    const saved = { ...card, version: 3, title: "Updated" };
    expect(replaceCard(board, saved)?.cards).toEqual([saved]);
    expect(board.cards[0]?.title).toBe("An idea");
  });
  it("appends a captured card and leaves missing boards alone", () => {
    const captured = { ...card, id: "new" };
    expect(replaceCard(board, captured)?.cards).toEqual([card, captured]);
    expect(replaceCard(null, captured)).toBeNull();
    expect(replaceCard(undefined, captured)).toBeUndefined();
  });
});
