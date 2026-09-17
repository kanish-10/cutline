import type { Board, Card } from "@cutline/shared";
import { afterAll, describe, expect, it } from "vitest";
import {
  cleanupDatabase,
  createTestEnv,
  parseBody,
  signIn,
  signUp,
} from "./testUtils.js";

afterAll(cleanupDatabase);

describe("cutline api", () => {
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
