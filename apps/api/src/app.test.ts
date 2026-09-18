import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APP,
  type Board,
  type BoardSummary,
  type Card,
  ERROR_CODES,
  LIMITS,
  STAGE_COLORS,
  type Stage,
} from "@cutline/shared";
import { serve } from "@hono/node-server";
import { afterEach, describe, expect, it } from "vitest";
import { cards, stages } from "./schema.js";
import {
  cleanupDatabase,
  createTestEnv,
  parseBody,
  signIn,
  signUp,
} from "./testUtils.js";

const directories: string[] = [];

afterEach(() => {
  cleanupDatabase();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

async function withHttp<T>(
  app: Awaited<ReturnType<typeof createTestEnv>>["app"],
  run: (
    request: (path: string, init?: RequestInit) => Promise<Response>,
  ) => Promise<T>,
) {
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  try {
    if (!server.listening) await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing HTTP server address");
    return await run((path, init) =>
      fetch(`http://127.0.0.1:${address.port}${path}`, {
        ...init,
        signal: AbortSignal.timeout(5000),
      }),
    );
  } finally {
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  }
}

function sessionCookie(response: Response) {
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie.length > 0).toBe(true);
  return cookie;
}

let signupAddress = 10;

async function multiBoardEnv() {
  const env = await createTestEnv();
  async function client(email: string) {
    const signup = await env.app.request(`${APP.authPath}/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `127.0.0.${signupAddress++}`,
      },
      body: JSON.stringify({
        email,
        password: "password-12-chars-min",
        name: email,
      }),
    });
    expect(signup.status).toBe(200);
    const headers = {
      cookie: sessionCookie(signup),
      "content-type": "application/json",
    };
    return (path: string, method = "GET", body?: unknown) =>
      env.app.request(`/api${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
  }
  const alice = await client("alice@example.com");
  const bob = await client("bob@example.com");
  async function create(request: typeof alice, name?: string) {
    const response = await request("/boards", "POST", {
      creatorType: "video",
      ...(name === undefined ? {} : { name }),
    });
    expect(response.status).toBe(201);
    return parseBody<Board>(response);
  }
  return { ...env, alice, bob, create };
}

describe("multi-board api", () => {
  it("lists only owned summaries, returns each created board, and deletes empty boards with their stages", async () => {
    const { app, db, alice, bob, create } = await multiBoardEnv();
    expect(await (await alice("/boards")).json()).toEqual([]);
    expect(await (await alice("/board")).json()).toBeNull();
    const first = await create(alice);
    const second = await create(alice, "  Second board  ");
    const other = await create(bob, "Bob's board");
    expect(first.name).toBe("My board");
    expect(second.name).toBe("Second board");
    expect(new Date(second.createdAt).toISOString()).toBe(second.createdAt);
    expect(second.id).not.toBe(first.id);
    expect(second.stages).toHaveLength(5);
    expect(second.stages.every((stage) => stage.boardId === second.id)).toBe(
      true,
    );
    const summaries = await parseBody<BoardSummary[]>(await alice("/boards"));
    expect(summaries).toEqual(
      [first, second].map(({ id, name, createdAt, creatorType }) => ({
        id,
        name,
        createdAt,
        creatorType,
        cardCount: 0,
      })),
    );
    expect(await (await alice(`/boards/${first.id}`)).json()).toEqual(first);
    expect(await (await alice(`/boards/${second.id}`)).json()).toEqual(second);
    expect(await (await alice("/board")).json()).toEqual(first);
    expect(
      (await alice("/board", "POST", { creatorType: "video" })).status,
    ).toBe(409);
    for (const id of [other.id, crypto.randomUUID()]) {
      expect((await alice(`/boards/${id}`)).status).toBe(404);
      expect((await alice(`/boards/${id}`, "DELETE")).status).toBe(404);
    }
    for (const path of ["/boards", `/boards/${second.id}`])
      expect((await app.request(`/api${path}`)).status).toBe(401);
    expect(
      (await app.request(`/api/boards/${second.id}`, { method: "DELETE" }))
        .status,
    ).toBe(401);
    const deleted = await alice(`/boards/${second.id}`, "DELETE");
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ ok: true });
    expect((await alice(`/boards/${second.id}`)).status).toBe(404);
    expect((await alice(`/boards/${second.id}`, "DELETE")).status).toBe(404);
    expect(
      db
        .select()
        .from(stages)
        .all()
        .some((stage) => stage.boardId === second.id),
    ).toBe(false);
    expect(await (await alice(`/boards/${first.id}`)).json()).toEqual(first);
    expect(await (await bob(`/boards/${other.id}`)).json()).toEqual(other);
    expect((await alice(`/boards/${first.id}`, "DELETE")).status).toBe(200);
    expect(await (await alice("/boards")).json()).toEqual([]);
    expect(await (await alice("/board")).json()).toBeNull();
  });

  it("validates names and explicit scopes without falling back to another board", async () => {
    const { alice, bob, create } = await multiBoardEnv();
    const first = await create(alice, "First");
    const other = await create(bob);
    for (const name of ["", " ", "x".repeat(81), null])
      expect(
        (await alice("/boards", "POST", { creatorType: "video", name })).status,
      ).toBe(400);
    expect(
      (await alice("/boards", "POST", { creatorType: "unknown" })).status,
    ).toBe(400);
    expect(
      (await alice("/boards", "POST", { creatorType: "video", userId: "bob" }))
        .status,
    ).toBe(400);
    const longest = await create(alice, "x".repeat(80));
    expect(longest.name).toHaveLength(80);
    for (const [path, body] of [
      ["/cards", { title: "No" }],
      ["/stages", { name: "No", color: STAGE_COLORS[0] }],
    ] as const) {
      for (const boardId of [other.id, crypto.randomUUID()])
        expect(
          (await alice(`${path}?boardId=${boardId}`, "POST", body)).status,
        ).toBe(404);
      for (const boardId of ["", "invalid"])
        expect(
          (await alice(`${path}?boardId=${boardId}`, "POST", body)).status,
        ).toBe(400);
    }
    expect((await alice("/boards/invalid")).status).toBe(400);
    expect((await alice("/boards/invalid", "DELETE")).status).toBe(400);
    expect(await (await alice(`/boards/${first.id}`)).json()).toEqual(first);
  });

  it("isolates scoped and legacy captures and resolves card and stage mutations by owner and resource ID", async () => {
    const { alice, bob, create } = await multiBoardEnv();
    const first = await create(alice, "First");
    const second = await create(alice, "Second");
    const other = await create(bob);
    const legacyCard = await parseBody<Card>(
      await alice("/cards", "POST", { title: "Legacy" }),
    );
    expect(legacyCard.boardId).toBe(first.id);
    const legacyStage = await parseBody<Stage>(
      await alice("/stages", "POST", {
        name: "Legacy stage",
        color: STAGE_COLORS[0],
      }),
    );
    expect(legacyStage.boardId).toBe(first.id);
    const capture = await alice(`/cards?boardId=${second.id}`, "POST", {
      title: "Second idea",
    });
    expect(capture.status).toBe(201);
    const card = await parseBody<Card>(capture);
    expect(card).toMatchObject({
      boardId: second.id,
      stageId: second.stages[0]?.id,
    });
    expect(card.checklist.length).toBeGreaterThan(0);
    const custom = await alice(`/stages?boardId=${second.id}`, "POST", {
      name: "Review",
      color: STAGE_COLORS[1],
    });
    expect(custom.status).toBe(201);
    const stage = await parseBody<Stage>(custom);
    expect(stage).toMatchObject({ boardId: second.id, position: 5 });
    const firstSnapshot = await (await alice(`/boards/${first.id}`)).json();
    const secondSnapshot = await (await alice(`/boards/${second.id}`)).json();
    for (const id of [card.id, legacyCard.id, crypto.randomUUID()])
      expect(
        (
          await bob(`/cards/${id}?boardId=${other.id}`, "PATCH", {
            version: 0,
            title: "No",
          })
        ).status,
      ).toBe(404);
    for (const id of [stage.id, legacyStage.id, crypto.randomUUID()]) {
      expect(
        (await bob(`/stages/${id}`, "PATCH", { name: "No", direction: "left" }))
          .status,
      ).toBe(404);
      expect((await bob(`/stages/${id}`, "DELETE")).status).toBe(404);
    }
    for (const stageId of [
      first.stages[0]?.id,
      other.stages[0]?.id,
      crypto.randomUUID(),
    ]) {
      const rejected = await alice(`/cards/${card.id}`, "PATCH", {
        version: 0,
        stageId,
        title: "No",
      });
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({
        error: "Stage must belong to this board",
      });
    }
    expect(await (await alice(`/boards/${second.id}`)).json()).toEqual(
      secondSnapshot,
    );
    const renamed = await alice(
      `/stages/${stage.id}?boardId=${first.id}`,
      "PATCH",
      { name: "Final review", direction: "left" },
    );
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({
      id: stage.id,
      boardId: second.id,
      name: "Final review",
      position: 4,
    });
    const moved = await alice(
      `/cards/${card.id}?boardId=${first.id}`,
      "PATCH",
      { version: 0, stageId: stage.id },
    );
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({
      boardId: second.id,
      stageId: stage.id,
      version: 1,
      publishedAt: null,
    });
    expect(
      (
        await alice(`/cards/${card.id}`, "PATCH", {
          version: 0,
          title: "Stale",
        })
      ).status,
    ).toBe(409);
    expect((await alice(`/stages/${stage.id}`, "DELETE")).status).toBe(409);
    expect(
      (
        await alice(`/cards/${card.id}`, "PATCH", {
          version: 1,
          archived: true,
        })
      ).status,
    ).toBe(200);
    expect((await alice(`/stages/${stage.id}`, "DELETE")).status).toBe(409);
    const published = await alice(`/cards/${card.id}`, "PATCH", {
      version: 2,
      stageId: second.stages.at(-1)?.id,
    });
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({
      publishedAt: expect.any(String),
      version: 3,
    });
    expect(
      (await alice(`/stages/${stage.id}?boardId=${first.id}`, "DELETE")).status,
    ).toBe(200);
    expect(
      (await alice(`/stages/${stage.id}`, "PATCH", { name: "Gone" })).status,
    ).toBe(404);
    const updated = await parseBody<Board>(await alice(`/boards/${second.id}`));
    expect(updated.stages.map((item) => item.position)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(updated.cards.map((item) => item.id)).toEqual([card.id]);
    expect(await (await alice(`/boards/${first.id}`)).json()).toEqual(
      firstSnapshot,
    );
    expect(await (await bob(`/boards/${other.id}`)).json()).toEqual(other);
  });

  it("counts archived cards in summaries and transactionally refuses deletion even when only archived cards remain", async () => {
    const { alice, bob, create } = await multiBoardEnv();
    const board = await create(alice);
    const card = await parseBody<Card>(
      await alice(`/cards?boardId=${board.id}`, "POST", { title: "Keep" }),
    );
    for (const archived of [false, true]) {
      if (archived)
        expect(
          (
            await alice(`/cards/${card.id}`, "PATCH", {
              version: 0,
              archived: true,
            })
          ).status,
        ).toBe(200);
      const before = await (await alice(`/boards/${board.id}`)).json();
      const response = await alice(`/boards/${board.id}`, "DELETE");
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: ERROR_CODES.boardNotEmpty,
      });
      expect(await (await alice(`/boards/${board.id}`)).json()).toEqual(before);
      expect(await (await alice("/boards")).json()).toEqual([
        {
          id: board.id,
          name: board.name,
          createdAt: board.createdAt,
          creatorType: board.creatorType,
          cardCount: 1,
        },
      ]);
      expect((await bob(`/boards/${board.id}`, "DELETE")).status).toBe(404);
    }
  });

  it("enforces stage and active-card quotas per board for capture and restore", async () => {
    const { db, alice, create } = await multiBoardEnv();
    const first = await create(alice, "Available");
    const full = await create(alice, "Full");
    const now = new Date().toISOString();
    const stage = full.stages[0];
    if (!stage) throw new Error("Missing stage");
    db.transaction((tx) => {
      for (let i = 0; i < LIMITS.cards; i += 1)
        tx.insert(cards)
          .values({
            id: crypto.randomUUID(),
            boardId: full.id,
            stageId: stage.id,
            title: `Idea ${i}`,
            checklist: [],
            tags: [],
            links: [],
            createdAt: now,
            updatedAt: now,
          })
          .run();
    });
    const capture = await alice(`/cards?boardId=${full.id}`, "POST", {
      title: "Full",
    });
    expect(capture.status).toBe(409);
    expect(await capture.json()).toMatchObject({ code: ERROR_CODES.cardLimit });
    const available = await alice(`/cards?boardId=${first.id}`, "POST", {
      title: "Available",
    });
    expect(available.status).toBe(201);
    const card = await parseBody<Card>(available);
    expect(
      (
        await alice(`/cards/${card.id}`, "PATCH", {
          version: 0,
          archived: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await alice(`/cards/${card.id}`, "PATCH", {
          version: 1,
          archived: false,
        })
      ).status,
    ).toBe(200);
    const archivedId = crypto.randomUUID();
    db.insert(cards)
      .values({
        id: archivedId,
        boardId: full.id,
        stageId: stage.id,
        title: "Archived",
        archived: true,
        checklist: [],
        tags: [],
        links: [],
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const restore = await alice(`/cards/${archivedId}`, "PATCH", {
      version: 0,
      archived: false,
    });
    expect(restore.status).toBe(409);
    expect(await restore.json()).toMatchObject({ code: ERROR_CODES.cardLimit });
    const summaries = await parseBody<BoardSummary[]>(await alice("/boards"));
    expect(summaries.find((board) => board.id === full.id)?.cardCount).toBe(
      LIMITS.cards + 1,
    );
    for (let i = full.stages.length; i < LIMITS.stages; i += 1)
      expect(
        (
          await alice(`/stages?boardId=${full.id}`, "POST", {
            name: `Stage ${i}`,
            color: STAGE_COLORS[0],
          })
        ).status,
      ).toBe(201);
    expect(
      (
        await alice(`/stages?boardId=${full.id}`, "POST", {
          name: "Full",
          color: STAGE_COLORS[0],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await alice(`/stages?boardId=${first.id}`, "POST", {
          name: "Available",
          color: STAGE_COLORS[0],
        })
      ).status,
    ).toBe(201);
    for (const item of first.stages.slice(1))
      expect((await alice(`/stages/${item.id}`, "DELETE")).status).toBe(200);
    const remaining = await parseBody<Board>(
      await alice(`/boards/${first.id}`),
    );
    const custom = remaining.stages[1];
    if (!custom) throw new Error("Missing custom stage");
    expect((await alice(`/stages/${custom.id}`, "DELETE")).status).toBe(200);
    expect(
      (await alice(`/stages/${first.stages[0]?.id}`, "DELETE")).status,
    ).toBe(409);
  });
});

describe("cutline api", () => {
  it("persists board changes and login sessions across a database reopen over HTTP", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cutline-api-"));
    directories.push(directory);
    const filename = join(directory, "cutline.db");
    const first = await createTestEnv(filename);
    const saved = await withHttp(first.app, async (request) => {
      async function registerAndLogin(email: string, name: string) {
        const credentials = { email, password: "password-12-chars-min" };
        const headers = {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.2",
        };
        const signup = await request(`${APP.authPath}/sign-up/email`, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...credentials, name }),
        });
        expect(signup.status).toBe(200);
        await signup.arrayBuffer();
        const login = await request(`${APP.authPath}/sign-in/email`, {
          method: "POST",
          headers,
          body: JSON.stringify(credentials),
        });
        expect(login.status).toBe(200);
        const cookie = sessionCookie(login);
        await login.arrayBuffer();
        return { cookie, "content-type": "application/json" };
      }

      const aliceHeaders = await registerAndLogin("alice@example.com", "Alice");
      const created = await request("/api/board", {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({ creatorType: "video" }),
      });
      expect(created.status).toBe(201);
      const board = await parseBody<Board>(created);
      expect(board.creatorType).toBe("video");
      expect(board.cards).toEqual([]);
      expect(board.stages.map((stage) => stage.name)).toEqual([
        "Backlog",
        "Script",
        "Film",
        "Edit",
        "Published",
      ]);
      const backlog = board.stages[0];
      const script = board.stages[1];
      if (!backlog || !script) throw new Error("Missing video stages");
      const captured = await request("/api/cards", {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({ title: "Persistent video" }),
      });
      expect(captured.status).toBe(201);
      const card = await parseBody<Card>(captured);
      expect(card).toMatchObject({
        boardId: board.id,
        stageId: backlog.id,
        title: "Persistent video",
        version: 0,
      });
      expect(card.checklist.length).toBeGreaterThan(0);
      const advance = await request(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: aliceHeaders,
        body: JSON.stringify({ version: card.version, stageId: script.id }),
      });
      expect(advance.status).toBe(200);
      const advanced = await parseBody<Card>(advance);
      expect(advanced).toEqual({
        ...card,
        stageId: script.id,
        version: 1,
        updatedAt: expect.any(String),
      });
      const expectedBoard = { ...board, cards: [advanced] };
      const ownRead = await request("/api/board", { headers: aliceHeaders });
      expect(ownRead.status).toBe(200);
      expect(await parseBody<Board>(ownRead)).toEqual(expectedBoard);

      const bobHeaders = await registerAndLogin("bob@example.com", "Bob");
      const bobCreated = await request("/api/board", {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({ creatorType: "podcast" }),
      });
      expect(bobCreated.status).toBe(201);
      const bobBoard = await parseBody<Board>(bobCreated);
      expect(bobBoard.id).not.toBe(board.id);
      expect(bobBoard.creatorType).toBe("podcast");
      expect(bobBoard.cards).toEqual([]);
      const bobRead = await request("/api/board", { headers: bobHeaders });
      expect(bobRead.status).toBe(200);
      expect(await parseBody<Board>(bobRead)).toEqual(bobBoard);
      const forbidden = await request(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: bobHeaders,
        body: JSON.stringify({
          version: advanced.version,
          title: "Not allowed",
        }),
      });
      expect(forbidden.status).toBe(404);
      expect(await forbidden.json()).toEqual({ error: "Card not found" });
      const unchanged = await request("/api/board", { headers: aliceHeaders });
      expect(unchanged.status).toBe(200);
      expect(await parseBody<Board>(unchanged)).toEqual(expectedBoard);
      return { aliceHeaders, bobHeaders, expectedBoard, bobBoard };
    });

    first.sqlite.close();
    expect(first.sqlite.open).toBe(false);
    const reopened = await createTestEnv(filename);
    await withHttp(reopened.app, async (request) => {
      const unauthenticated = await request("/api/board");
      expect(unauthenticated.status).toBe(401);
      await unauthenticated.arrayBuffer();
      const aliceRead = await request("/api/board", {
        headers: saved.aliceHeaders,
      });
      expect(aliceRead.status).toBe(200);
      expect(await parseBody<Board>(aliceRead)).toEqual(saved.expectedBoard);
      const bobRead = await request("/api/board", {
        headers: saved.bobHeaders,
      });
      expect(bobRead.status).toBe(200);
      expect(await parseBody<Board>(bobRead)).toEqual(saved.bobBoard);
    });
  });
  it("health endpoint is public", async () => {
    const { app } = await createTestEnv();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
  });
  it("rejects unauthenticated board access", async () => {
    const { app } = await createTestEnv();
    const response = await app.request("/api/board");
    expect(response.status).toBe(401);
  });
  it("signup, login, board lifecycle, capture, advance", async () => {
    const { app } = await createTestEnv();
    const alice = await signUp(
      app,
      "alice@example.com",
      "password-12-chars-min",
      "Alice",
    );
    expect(alice.status).toBe(200);
    const cookie = alice.headers.get("set-cookie") ?? "";
    const badLogin = await signIn(
      app,
      "alice@example.com",
      "wrong-password-123",
    );
    expect(badLogin.status).toBe(401);
    const created = await app.request("/api/board", {
      method: "POST",
      body: JSON.stringify({ creatorType: "video" }),
      headers: { cookie, "content-type": "application/json" },
    });
    expect(created.status).toBe(201);
    const board = await parseBody<Board>(created);
    expect(board.stages.map((s) => s.name)).toEqual([
      "Backlog",
      "Script",
      "Film",
      "Edit",
      "Published",
    ]);
    const duplicate = await app.request("/api/board", {
      method: "POST",
      body: JSON.stringify({ creatorType: "video" }),
      headers: { cookie, "content-type": "application/json" },
    });
    expect(duplicate.status).toBe(409);
    const cardResponse = await app.request("/api/cards", {
      method: "POST",
      body: JSON.stringify({ title: "My first video" }),
      headers: { cookie, "content-type": "application/json" },
    });
    expect(cardResponse.status).toBe(201);
    const card = await parseBody<Card>(cardResponse);
    expect(card.checklist.length).toBeGreaterThan(0);
    expect(board.stages[0]?.id).toBe(card.stageId);
    const scriptStage = board.stages[1];
    if (!scriptStage) throw new Error("missing script stage");
    const advance = await app.request(`/api/cards/${card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ version: 0, stageId: scriptStage.id }),
      headers: { cookie, "content-type": "application/json" },
    });
    expect(advance.status).toBe(200);
    const advanced = await parseBody<Card>(advance);
    expect(advanced.stageId).toBe(scriptStage.id);
    expect(advanced.version).toBe(1);
    const stale = await app.request(`/api/cards/${card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ version: 0, stageId: board.stages[2]?.id }),
      headers: { cookie, "content-type": "application/json" },
    });
    expect(stale.status).toBe(409);
    const notFound = await app.request(`/api/cards/${crypto.randomUUID()}`, {
      method: "PATCH",
      body: JSON.stringify({ version: 1, stageId: scriptStage.id }),
      headers: { cookie, "content-type": "application/json" },
    });
    expect(notFound.status).toBe(404);
    const bob = await signUp(
      app,
      "bob@example.com",
      "password-12-chars-min",
      "Bob",
    );
    const bobCookie = bob.headers.get("set-cookie") ?? "";
    const forbidden = await app.request(`/api/cards/${card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ version: 1, title: "Bob was here" }),
      headers: { cookie: bobCookie, "content-type": "application/json" },
    });
    expect(forbidden.status).toBe(404);
  });

  it("archived cards do not consume the active-card quota, and restore respects capacity", async () => {
    const { app, db } = await createTestEnv();
    const signup = await signUp(
      app,
      "quota@example.com",
      "password-12-chars-min",
      "Quota",
    );
    const cookie = sessionCookie(signup);
    const headers = { cookie, "content-type": "application/json" };
    const created = await app.request("/api/board", {
      method: "POST",
      headers,
      body: JSON.stringify({ creatorType: "video" }),
    });
    expect(created.status).toBe(201);
    const board = await parseBody<Board>(created);
    const backlog = board.stages[0];
    if (!backlog) throw new Error("missing backlog stage");
    const now = new Date().toISOString();
    const base = {
      boardId: board.id,
      stageId: backlog.id,
      checklist: [],
      tags: [],
      links: [],
      createdAt: now,
      updatedAt: now,
    };
    for (let index = 0; index < LIMITS.cards; index += 1) {
      db.insert(cards)
        .values({
          ...base,
          id: crypto.randomUUID(),
          title: `Active ${index}`,
          archived: false,
        })
        .run();
    }
    const archivedId = crypto.randomUUID();
    db.insert(cards)
      .values({ ...base, id: archivedId, title: "Old idea", archived: true })
      .run();
    const seeded = await parseBody<Board>(
      await app.request("/api/board", { headers }),
    );
    const freeOne = seeded.cards.find(
      (card) => card.id !== archivedId && !card.archived,
    );
    if (!freeOne) throw new Error("missing seeded card");

    const capture = (title: string) =>
      app.request("/api/cards", {
        method: "POST",
        headers,
        body: JSON.stringify({ title }),
      });
    const full = await capture("One too many");
    expect(full.status).toBe(409);
    const fullBody = (await full.json()) as { error?: string; code?: string };
    expect(fullBody.error).toContain("active-card limit");
    expect(fullBody.code).toBe(ERROR_CODES.cardLimit);
    const archived = await app.request(`/api/cards/${freeOne.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ version: freeOne.version, archived: true }),
    });
    expect(archived.status).toBe(200);
    const reopened = await capture("Room for one more");
    expect(reopened.status).toBe(201);
    const restored = await app.request(`/api/cards/${archivedId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ version: 0, archived: false }),
    });
    expect(restored.status).toBe(409);
    expect(((await restored.json()) as { code?: string }).code).toBe(
      ERROR_CODES.cardLimit,
    );
    const roomCard = await parseBody<Card>(reopened);
    const makeRoom = await app.request(`/api/cards/${roomCard.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ version: roomCard.version, archived: true }),
    });
    expect(makeRoom.status).toBe(200);
    const restore = await app.request(`/api/cards/${archivedId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ version: 0, archived: false }),
    });
    expect(restore.status).toBe(200);
    expect((await parseBody<Card>(restore)).archived).toBe(false);
    const listed = await parseBody<Board>(
      await app.request("/api/board", { headers }),
    );
    expect(listed.cards.filter((item) => item.archived).length).toBe(2);
  });
});
