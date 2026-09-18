import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createApiClient,
  createBoardSchema,
  createCardSchema,
  ERROR_CODES,
  QUERY_KEYS,
  STAGE_COLORS,
  safeUrlSchema,
  updateCardSchema,
} from "./index";

afterEach(() => vi.unstubAllGlobals());

describe("multi-board contracts", () => {
  it("accepts legacy creation and trims optional board names", () => {
    expect(createBoardSchema.parse({ creatorType: "video" })).toEqual({
      creatorType: "video",
    });
    expect(
      createBoardSchema.parse({ creatorType: "written", name: "  Writing  " })
        .name,
    ).toBe("Writing");
    expect(
      createBoardSchema.parse({ creatorType: "podcast", name: "a".repeat(80) })
        .name,
    ).toHaveLength(80);
    for (const name of ["", "  ", "a".repeat(81), null, 42])
      expect(
        createBoardSchema.safeParse({ creatorType: "video", name }).success,
      ).toBe(false);
    expect(
      createBoardSchema.safeParse({ creatorType: "video", userId: "other" })
        .success,
    ).toBe(false);
  });
  it("preserves cache prefixes", () => {
    expect(QUERY_KEYS.board).toEqual(["board"]);
    expect(QUERY_KEYS.boards).toEqual(["boards"]);
    expect(QUERY_KEYS.boardById("second")).toEqual(["board", "second"]);
  });
  it("scopes reads and creates, but resolves mutations by resource ID", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const api = createApiClient(
      "https://example.com/",
      () => ({ Cookie: "session=test" }),
      "board /?",
    );
    await api.getBoard();
    await api.getBoards();
    await api.createBoard({ creatorType: "video", name: "New" });
    await api.createCard("Idea");
    await api.createStage({ name: "Review", color: STAGE_COLORS[0] });
    await api.updateCard("card /", { version: 0, title: "Updated" });
    await api.updateStage("stage /", { name: "Updated" });
    await api.deleteStage("stage /");
    await api.deleteBoard("other /");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://example.com/api/boards/board%20%2F%3F",
      "https://example.com/api/boards",
      "https://example.com/api/boards",
      "https://example.com/api/cards?boardId=board%20%2F%3F",
      "https://example.com/api/stages?boardId=board%20%2F%3F",
      "https://example.com/api/cards/card%20%2F",
      "https://example.com/api/stages/stage%20%2F",
      "https://example.com/api/stages/stage%20%2F",
      "https://example.com/api/boards/other%20%2F",
    ]);
    expect(fetch.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ creatorType: "video", name: "New" }),
    });
    expect(fetch.mock.calls[8]?.[1]).toMatchObject({ method: "DELETE" });
    for (const [, init] of fetch.mock.calls)
      expect(init).toMatchObject({
        credentials: "include",
        headers: { Cookie: "session=test" },
      });
  });
  it("retains unscoped legacy reads and creates", async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json(null));
    vi.stubGlobal("fetch", fetch);
    const api = createApiClient("https://example.com");
    expect(await api.getBoard()).toBeNull();
    await api.createCard("Idea");
    await api.createStage({ name: "Review", color: STAGE_COLORS[0] });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://example.com/api/board",
      "https://example.com/api/cards",
      "https://example.com/api/stages",
    ]);
  });
  it("preserves coded deletion conflicts and scoped not-found errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          Response.json(
            { error: "Not empty", code: ERROR_CODES.boardNotEmpty },
            { status: 409 },
          ),
        ),
    );
    const api = createApiClient("https://example.com", undefined, "missing");
    await expect(api.deleteBoard("board")).rejects.toMatchObject({
      status: 409,
      code: "BOARD_NOT_EMPTY",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          Response.json({ error: "Board not found" }, { status: 404 }),
        ),
    );
    await expect(api.getBoard()).rejects.toBeInstanceOf(ApiError);
    await expect(api.getBoard()).rejects.toMatchObject({ status: 404 });
  });
});

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
