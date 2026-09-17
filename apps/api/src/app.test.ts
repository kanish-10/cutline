import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP, type Board, type Card } from "@cutline/shared";
import { serve } from "@hono/node-server";
import { afterEach, describe, expect, it } from "vitest";
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
});
